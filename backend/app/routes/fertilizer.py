from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.rag import generate_feature_output
import re

router = APIRouter()

# ── Request schema ────────────────────────────────────────────
class FertilizerInput(BaseModel):
    chili_type:   str
    growth_stage: str
    soil_type:    str
    moisture:     str
    sunlight:     str
    location:     str

# ── Template ──────────────────────────────────────────────────
TEMPLATE = """
You are an expert agricultural advisor specializing in chili farming in Malaysia.

Based on the inputs provided, give a complete fertilizer and care recommendation.
Follow this EXACT format — do not skip or rename any section:

🌱 **Fertilizer Recommendation**
- Type: [Organic / Chemical / Balanced NPK]
- Suggested NPK Ratio: [e.g. 15:15:15 for vegetative, 12:24:12 for flowering]
- Simple Alternative: [e.g. compost, chicken manure]
- Manure suggestion: [specific type and application rate]

⏱ **Application Schedule**
- Frequency: [e.g. every 2 weeks]
- Best time to apply: [e.g. early morning after watering]

💧 **Watering Guide**
- Frequency: [e.g. once daily, twice in hot weather]
- Key watering tips: [specific advice based on soil and moisture level]

🌞 **Sunlight Requirement**
- Hours of sunlight per day: [e.g. 6–8 hours]
- Exposure advice: [specific advice based on environment]

🌡 **Environment Conditions**
- Temperature range: [ideal °C for this variety and stage]
- Humidity or weather notes: [relevant to Malaysian climate]

🪴 **Soil Information**
- Soil behavior: [how this soil holds water and nutrients]
- Drainage condition: [good / moderate / poor and what it means]
- Improvement tip: [how to enhance this soil type]

⚠️ **Common Mistakes**
- [Mistake 1 specific to this combination]
- [Mistake 2]

🌿 **Expected Result**
- [What improvement the plant will show within 2–4 weeks]

📝 **Simple Action Tip**
- [One short, practical action the farmer should do today]

RULES:
- Be specific to the inputs provided — do not give generic advice
- Use practical Malaysian farming language
- All sections are mandatory — never skip any
- Use bullet points with - for all items
"""

# ── Parser ────────────────────────────────────────────────────
SECTION_KEYS = [
    ("fertilizer",   r"🌱\s*\*\*Fertilizer Recommendation\*\*"),
    ("schedule",     r"⏱\s*\*\*Application Schedule\*\*"),
    ("watering",     r"💧\s*\*\*Watering Guide\*\*"),
    ("sunlight",     r"🌞\s*\*\*Sunlight Requirement\*\*"),
    ("environment",  r"🌡\s*\*\*Environment Conditions\*\*"),
    ("soil",         r"🪴\s*\*\*Soil Information\*\*"),
    ("mistakes",     r"⚠️\s*\*\*Common Mistakes\*\*"),
    ("expected",     r"🌿\s*\*\*Expected Result\*\*"),
    ("tip",          r"📝\s*\*\*Simple Action Tip\*\*"),
]

def parse_output(text: str) -> dict:
    """
    Parse each section from the LLM response into a dict of lists.
    Returns: { section_key: [line1, line2, ...], ... }
    """
    result = {key: [] for key, _ in SECTION_KEYS}

    # Build list of (key, match_start) for all found sections
    found = []
    for key, pattern in SECTION_KEYS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            found.append((key, m.start(), m.end()))

    # Sort by position
    found.sort(key=lambda x: x[1])

    # Extract content between each section header and the next
    for i, (key, start, end) in enumerate(found):
        next_start = found[i + 1][1] if i + 1 < len(found) else len(text)
        block = text[end:next_start].strip()

        lines = [
            re.sub(r"^[\s\-•–]+", "", l).replace("**", "").strip()
            for l in block.splitlines()
            if re.sub(r"^[\s\-•–]+", "", l).replace("**", "").strip()
        ]
        result[key] = lines

    result["raw"] = text
    return result

# ── Route ─────────────────────────────────────────────────────
@router.post("/fertilizer")
async def fertilizer_care(data: FertilizerInput):
    try:
        output = await generate_feature_output(
            user_input     = data.model_dump(),
            collection_key = "fertilizer_care",
            template       = TEMPLATE,
        )

        # output may be a plain string or {"result": "..."}
        raw_text = output.get("result", output) if isinstance(output, dict) else str(output)

        parsed = parse_output(raw_text)

        return {
            "status":      "success",
            "fertilizer":  parsed["fertilizer"],
            "schedule":    parsed["schedule"],
            "watering":    parsed["watering"],
            "sunlight":    parsed["sunlight"],
            "environment": parsed["environment"],
            "soil":        parsed["soil"],
            "mistakes":    parsed["mistakes"],
            "expected":    parsed["expected"],
            "tip":         parsed["tip"],
            "raw":         raw_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))