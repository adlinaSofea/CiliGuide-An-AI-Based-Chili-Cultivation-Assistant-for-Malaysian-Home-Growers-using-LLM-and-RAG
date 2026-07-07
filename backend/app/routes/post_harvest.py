from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.rag import generate_feature_output
 
router = APIRouter()
 
# ── Request schema ────────────────────────────────────────────
class PostHarvestInput(BaseModel):
    chili_type:  str
    condition:   str
    fruit_color: str
    quantity:    str
 
# ── Template ──────────────────────────────────────────────────
TEMPLATE = """ 
📦 Storage Recommendation:
-
 
🍽️ Cooking Suggestions:
- Best used for:
- Recommended dishes:
- Preparation tips:
 
🕒 Preservation Methods:
-
 
🌡 Handling Tips:
-
 
🧴 Drying / Processing:
-
 
❄️ Freezing Instructions:
-
"""
 
# ── Route ─────────────────────────────────────────────────────
@router.post("/post-harvest")
async def post_harvest(data: PostHarvestInput):
    try:
        output = await generate_feature_output(
            user_input     = data.model_dump(),
            collection_key = "post_harvest",
            template       = TEMPLATE,
        )
        return output
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))