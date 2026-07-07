from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.rag import generate_feature_output

router = APIRouter()


# ── Request schema ─────────────────────────────
class AdvisoryInput(BaseModel):
    question: str = Field(..., min_length=3)


# ── Template ───────────────────────────────────
TEMPLATE = """
🌶️ Chili Advisory:

"""


# ── Route ──────────────────────────────────────
@router.post("/advisory")
async def advisory(data: AdvisoryInput):
    try:
        print("Advisory query:", data.question)

        output = await generate_feature_output(
            user_input=data.model_dump(),
            collection_key="chat_advisory",
            template=TEMPLATE,
        )

        return output

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))