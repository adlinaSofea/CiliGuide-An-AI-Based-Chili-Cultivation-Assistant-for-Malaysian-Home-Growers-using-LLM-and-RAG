import base64
import json
import re
import asyncio
import io

from fastapi import APIRouter, HTTPException, UploadFile, File
from PIL import Image
import ollama

from app.config import VISION_MODEL

router = APIRouter()


# ── Resize image ──────────────────────────────────────────────
def resize_image(img_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(img_bytes))

    if img.mode != "RGB":
        img = img.convert("RGB")

    img = img.resize((512, 512), Image.LANCZOS)

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85)

    return base64.b64encode(buffer.getvalue()).decode()


# ── Parse moisture level ──────────────────────────────────────
def parse_moisture_level(value: str) -> str:
    if not value:
        return "moist"

    val = value.lower().strip()

    if "dry"      in val: return "dry"
    if "wet"      in val: return "wet"
    if "moist"    in val: return "moist"
    if "moderate" in val: return "moist"

    return "moist"


# ── Parse confidence ──────────────────────────────────────────
def parse_confidence(value: str) -> str:
    if not value:
        return "50%"

    nums = re.findall(r'\d+(?:\.\d+)?', str(value))
    if not nums:
        return "50%"

    num = float(nums[0])

    if num <= 1.0:
        num = round(num * 100)
    else:
        num = round(num)

    num = max(0, min(100, int(num)))

    return f"{num}%"


# ── Parse explanation ─────────────────────────────────────────
def parse_explanation(value: str, fallback: str) -> str:
    if not value:
        return ""

    # Clean stray JSON artifacts
    cleaned = value.strip().strip('"').strip("'").strip()
    cleaned = cleaned.replace('\\n', ' ').replace('\\"', '"')

    # If looks like JSON artifact return empty
    if cleaned in ["{", "}", "null", "None", ""]:
        return ""

    return cleaned


# ── Parse recommendations ─────────────────────────────────────
def parse_recommendations(value, moisture_level: str) -> list:
    """
    Parse recommendations from AI response or fallback to defaults
    """
    # Default fallbacks by moisture level
    fallback_map = {
        'dry': [
            'Water your soil immediately.',
            'Use mulch to retain moisture.',
            'Water early morning or evening.'
        ],
        'moist': [
            'Soil is optimal for growth.',
            'Ensure good drainage.',
            'Add organic compost.'
        ],
        'wet': [
            'Reduce watering immediately.',
            'Improve drainage system.',
            'Check for root rot risk.'
        ]
    }
    
    # If value is a list and has items, use it
    if isinstance(value, list) and len(value) > 0:
        # Clean each recommendation
        cleaned = []
        for rec in value:
            if isinstance(rec, str) and rec.strip():
                cleaned.append(rec.strip())
        
        if len(cleaned) >= 3:
            return cleaned[:3]  # Return first 3
    
    # Fallback to defaults
    return fallback_map.get(moisture_level, fallback_map['moist'])


# ── Extract JSON safely ───────────────────────────────────────
def extract_json(raw: str) -> dict:
    # Remove markdown code blocks
    cleaned = re.sub(r"```json|```", "", raw).strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Greedy match — gets full JSON including long explanation
    match = re.search(r'\{[\s\S]*\}', cleaned)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Last resort — extract fields manually
    result = {}

    level_match = re.search(
        r'"moisture_level"\s*:\s*"([^"]+)"', cleaned
    )
    if level_match:
        result["moisture_level"] = level_match.group(1)

    conf_match = re.search(
        r'"moisture_confidence"\s*:\s*"([^"]+)"', cleaned
    )
    if conf_match:
        result["moisture_confidence"] = conf_match.group(1)

    # Allow longer explanation text
    exp_match = re.search(
        r'"explanation"\s*:\s*"([^"]*)"', cleaned
    )
    if exp_match:
        result["explanation"] = exp_match.group(1)
    
    # Extract recommendations array
    reco_match = re.search(
        r'"recommendations"\s*:\s*\[(.*?)\]', cleaned, re.DOTALL
    )
    if reco_match:
        reco_str = reco_match.group(1)
        # Extract individual recommendations
        recommendations = re.findall(r'"([^"]+)"', reco_str)
        if recommendations:
            result["recommendations"] = recommendations

    return result


# ── Ollama vision call ────────────────────────────────────────
def _call_vision(img_b64: str) -> str:
    prompt = """You are a soil moisture expert analyzing a soil image for chili plant farming.

Reply ONLY with this exact JSON format and nothing else — no extra text, no markdown:
{
  "moisture_level": "",
  "moisture_confidence": "",
  "explanation": "",
  "recommendations": []
}

Moisture level rules — choose EXACTLY one:
- "dry"   → soil looks pale, cracked, powdery, or light-coloured with no visible moisture
- "moist" → soil looks dark but firm, holds shape, not sticky or waterlogged
- "wet"   → soil looks very dark, muddy, waterlogged, glossy, or has pooling water

Confidence level rules — give a % number based on image clarity:
- Use 70–100% if the soil is clearly visible and easy to classify
- Use 40–69% if the image is slightly blurry or lighting is poor
- Use 10–39% if the soil is very unclear, obscured, or image quality is very low

Do NOT use "moderate" — only dry, moist, or wet are accepted.
The explanation field must be a complete 1-2 sentences describing what you observe.

The recommendations field must be an array of EXACTLY 3 SHORT actionable tips (each max 15 words) based on the moisture level:
- For dry soil: tips about watering, mulching, moisture retention
- For moist soil: tips about maintaining optimal conditions, drainage, nutrients
- For wet soil: tips about reducing water, improving drainage, preventing root rot

Example format:
{
  "moisture_level": "dry",
  "moisture_confidence": "85%",
  "explanation": "The soil appears pale and cracked with no visible moisture.",
  "recommendations": [
    "Water your soil immediately.",
    "Use mulch to retain moisture.",
    "Water early morning or evening."
  ]
}"""

    response = ollama.chat(
        model=VISION_MODEL,
        messages=[{
            "role":    "user",
            "content": prompt,
            "images":  [img_b64]
        }],
        options={
            "num_predict": 600,  
            "temperature": 0.1,
            "num_ctx":     1024,
        }
    )
    return response["message"]["content"]


# ── Route ─────────────────────────────────────────────────────
@router.post("/soil")
async def analyze_soil(file: UploadFile = File(...)):
    """
    Accepts image upload, analyzes soil moisture with vision model.
    Returns: { moisture_level, moisture_confidence, explanation, recommendations }
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload an image file (jpg, png, etc.)"
        )

    raw = ""

    try:
        img_bytes = await file.read()
        img_b64   = resize_image(img_bytes)

        raw = await asyncio.to_thread(_call_vision, img_b64)

        result = extract_json(raw)

        moisture_level      = parse_moisture_level(
            result.get("moisture_level", "")
        )
        moisture_confidence = parse_confidence(
            result.get("moisture_confidence", "")
        )
        explanation         = parse_explanation(
            result.get("explanation", ""), raw
        )
        recommendations     = parse_recommendations(
            result.get("recommendations", []), moisture_level
        )

        return {
            "moisture_level":      moisture_level,
            "moisture_confidence": moisture_confidence,
            "explanation":         explanation,
            "recommendations":     recommendations,  
        }

    except Exception as e:
        return {
            "moisture_level":      "unknown",
            "moisture_confidence": "0%",
            "explanation":         f"Analysis could not be completed: {str(e)}",
            "recommendations":     [
                "Unable to analyze soil.",
                "Please try uploading a clearer image.",
                "Ensure good lighting for best results."
            ]
        }