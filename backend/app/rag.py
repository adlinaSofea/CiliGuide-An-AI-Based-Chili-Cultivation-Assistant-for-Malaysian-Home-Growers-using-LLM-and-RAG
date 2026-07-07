import asyncio
import numpy as np
import ollama

from app.database import get_collection
from app.config import TEXT_MODEL



# CONFIG 
TOP_K = 3
MAX_CONTEXT_CHARS = 1200  #maximum total context size sent to the AI model
MAX_CHUNK_CHARS = 500     #maximum size of each text chunk (splitting)
NUM_PREDICT = 1000         #maximum number of tokens the AI is allowed to generate the response
NUM_CTX = 2048            #context window size (memory capacity)



# Confidence score helper
def confidence_score(distance: float) -> float:
    return round(float(np.exp(-distance)) * 100, 2)



# Semantic search 
def semantic_search(query: str, collection_key: str, top_n: int = TOP_K) -> list:
    coll = get_collection(collection_key)

    if coll.count() == 0:
        return []

    top_n = min(top_n, coll.count())

    results = coll.query(
        query_texts=[query],
        n_results=top_n
    )

    docs = []
    for i in range(len(results["documents"][0])):
        docs.append({
            "text": results["documents"][0][i],
            "filename": results["metadatas"][0][i]["filename"],
            "distance": results["distances"][0][i],
            "confidence": confidence_score(results["distances"][0][i])
        })

    return docs



# Context builder 
def build_context(docs: list) -> str:
    context = ""

    for d in docs:
        # trim each chunk to avoid token explosion
        text = d["text"][:MAX_CHUNK_CHARS]

        if len(context) + len(text) > MAX_CONTEXT_CHARS:
            break

        context += text + "\n\n"

    return context.strip()



# Ollama call (fast settings)

def _call_ollama(prompt: str) -> str:
    resp = ollama.chat(
        model=TEXT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        options={
            "num_predict": NUM_PREDICT,
            "temperature": 0.2,
            "num_ctx": NUM_CTX
        }
    )

    return resp["message"]["content"]



# MAIN RAG PIPELINE 
async def generate_feature_output(
    user_input: dict,
    collection_key: str,
    template: str,
    is_disease: bool = False
) -> dict:

    # 1. Build query
    query = " ".join(str(v) for v in user_input.values() if v)

    # 2. Retrieve docs
    docs = semantic_search(query, collection_key, TOP_K)

    if not docs:
        return {
            "result": "No relevant information found.",
            "confidence": 0,
            "sources": []
        }

    # 3. Build optimized context
    context = build_context(docs)

    # 4. Average confidence
    avg_conf = round(
        sum(d["confidence"] for d in docs) / len(docs),
        2
    )

    # 5. Build prompt
    if is_disease:
        # For disease: include confidence hint in prompt, not template
        prompt = f"""
You are a chili farming assistant in Malaysia.

Use ONLY the context below to diagnose the disease.

CONTEXT:
{context}

USER INPUT:
{user_input}

INSTRUCTIONS:
{template}

IMPORTANT RULES:
- You MUST fill in ALL sections of the template
- Do NOT leave any section empty
- Disease Name: Be specific (e.g., "Aphid Infestation", not just "Pest")
- Symptoms: List at least 3 symptoms from the user input
- Actions: Provide at least 3-5 specific, actionable steps
- Notes: Write 2-3 sentences about causes, prevention, or when to seek help (MANDATORY - minimum 20 words)
- Confidence Level: Use approximately {avg_conf}% based on the quality of the match
- Format exactly as shown in the template with emojis
"""
    else:
        # For other features: simpler prompt
        prompt = f"""
You are a chili farming assistant in Malaysia.

Use ONLY the context below.

CONTEXT:
{context}

USER INPUT:
{user_input}

TEMPLATE:
{template}

Rules:
- Fill the template completely
- Be concise and practical
- Use bullet points where appropriate
"""

    # 6. Run LLM (non-blocking)
    result = await asyncio.to_thread(_call_ollama, prompt)

    # 7. Return structured output
    return {
        "result": result,
        "confidence": avg_conf,
        "sources": [d["filename"] for d in docs]
    }