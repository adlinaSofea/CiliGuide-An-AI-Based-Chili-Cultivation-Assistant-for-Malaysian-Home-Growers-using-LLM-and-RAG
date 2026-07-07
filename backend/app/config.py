import os
from dotenv import load_dotenv

load_dotenv()

# ── Paths ────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROMADB_PATH = os.path.join(BASE_DIR, "database", "chroma_db")

# ── ChromaDB collection names ────────────────────────────────
COLLECTIONS = {
    "chat_advisory":     "chat_advisory",
    "fertilizer_care":   "fertilizer_care",
    "disease_detection": "disease_detection",
    "post_harvest":      "post_harvest",
}

# ── Ollama model names ───────────────────────────────────────
TEXT_MODEL   = "gpt-oss:20b-cloud"
VISION_MODEL = "gemma4:31b-cloud"

# ── Embedding model ──────────────────────────────────────────
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# ── API Keys (loaded from .env file — never hardcoded) ───────
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY", "")
FRONTEND_URL    = os.getenv("FRONTEND_URL", "http://localhost:5500")
