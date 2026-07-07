from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.rag import generate_feature_output
import re

router = APIRouter()

# ── Request schema ────────────────────────────────────────────
class DiseaseInput(BaseModel):
    chili_type:   str
    growth_stage: str
    symptoms:     str

# ── Template - STRICT FORMAT ─────────────────────────────────
TEMPLATE = """
Based on the chili plant symptoms provided, analyze and provide a complete diagnosis.

IMPORTANT: You MUST follow this EXACT format and include ALL sections:

DISEASE_NAME: [Disease name only — e.g. "Fusarium Wilt"]

🦠 Possible Disease:
• [Same disease name as DISEASE_NAME above]

🔍 Symptoms Identified:
• [List each symptom observed - minimum 3 symptoms]
• [Include all relevant symptoms from input]
• [Be specific and detailed]

🛠 Recommended Actions:
• [Immediate action — within 24 hours]
• [Short-term action — within 1 week]
• [Preventive action — ongoing]
• [Chemical/biological control if applicable]
• [When to discard plant if disease is uncontrollable]

📝 Notes:
[2–3 sentences covering: root cause of the disease and environmental conditions that worsen it. This section is MANDATORY.]

RULES:
- DISEASE_NAME line is MANDATORY — never leave it blank or write "Unknown"
- Disease name must be specific (e.g., "Aphid Infestation" not just "Pest Problem")
- Include at least 3 symptoms
- Include at least 3 recommended actions
- Notes section MUST have actual content (minimum 20 words)
- Do NOT include any confidence score or percentage anywhere
- Do NOT skip any section
"""

# ── Route ─────────────────────────────────────────────────────
@router.post("/disease")
async def disease_detection(data: DiseaseInput):
    try:
        output = await generate_feature_output(
            user_input     = data.model_dump(),
            collection_key = "disease_detection",
            template       = TEMPLATE,
            # is_disease removed — it was appending confidence score into Notes
        )

        # Safely extract raw text from whatever generate_feature_output returns
        raw_text = extract_raw_text(output)

        # Parse into structured fields
        parsed = parse_output(raw_text)

        return {
            "status":       "success",
            "disease_name": parsed["disease_name"],
            "symptoms":     parsed["symptoms"],
            "actions":      parsed["actions"],
            "notes":        parsed["notes"],
            "raw":          raw_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Extract raw text from any return structure ────────────────
def extract_raw_text(output) -> str:
    """Handles plain string or any dict key from generate_feature_output."""
    if isinstance(output, str):
        return output.strip()
    if isinstance(output, dict):
        for key in ("result", "output", "response", "text", "answer", "message", "content"):
            if key in output and isinstance(output[key], str):
                return output[key].strip()
        parts = [v for v in output.values() if isinstance(v, str)]
        if parts:
            return " ".join(parts).strip()
    return str(output).strip()


# ── Strip confidence if LLM sneaks it in anyway ──────────────
CONFIDENCE_PATTERN = re.compile(
    r"\.?\s*Confidence(?:\s*Level)?[:\s]+[\d.]+\s*%?",
    re.IGNORECASE
)

def strip_confidence(text: str) -> str:
    return CONFIDENCE_PATTERN.sub("", text).strip()


# ── Parser ────────────────────────────────────────────────────
def parse_output(text: str) -> dict:
    result = {
        "disease_name": "Unknown",
        "symptoms":     [],
        "actions":      [],
        "notes":        "",
    }

    if not text:
        return result

    # 1. Disease name — DISEASE_NAME anchor first, fallback to emoji section
    name_match = re.search(r"DISEASE_NAME:\s*(.+)", text, re.IGNORECASE)
    if name_match:
        result["disease_name"] = name_match.group(1).strip()
    else:
        fallback = re.search(
            r"🦠\s*Possible Disease:\s*\n\s*[•\-]\s*(.+)", text, re.IGNORECASE
        )
        if fallback:
            result["disease_name"] = fallback.group(1).strip()

    # 2. Symptoms block — between 🔍 and 🛠
    sym_match = re.search(
        r"🔍\s*Symptoms Identified:\s*([\s\S]*?)(?=🛠)", text, re.IGNORECASE
    )
    if sym_match:
        lines = sym_match.group(1).strip().splitlines()
        result["symptoms"] = [
            re.sub(r"^[\s•\-–]+", "", l).strip()
            for l in lines
            if re.sub(r"^[\s•\-–]+", "", l).strip()
        ]

    # 3. Actions block — between 🛠 and 📝
    act_match = re.search(
        r"🛠\s*Recommended Actions:\s*([\s\S]*?)(?=📝)", text, re.IGNORECASE
    )
    if act_match:
        lines = act_match.group(1).strip().splitlines()
        result["actions"] = [
            re.sub(r"^[\s•\-–]+", "", l).strip()
            for l in lines
            if re.sub(r"^[\s•\-–]+", "", l).strip()
        ]

    # 4. Notes block — after 📝 to RULES or end
    #    strip_confidence removes any score the LLM sneaks in
    note_match = re.search(
        r"📝\s*Notes?:\s*([\s\S]+?)(?=RULES|$)", text, re.IGNORECASE
    )
    if note_match:
        result["notes"] = strip_confidence(note_match.group(1).strip())

    return result