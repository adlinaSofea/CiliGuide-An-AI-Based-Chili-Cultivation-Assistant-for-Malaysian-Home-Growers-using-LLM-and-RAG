from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx

from app.database import init_chromadb
from app.routes import advisory, disease, fertilizer, post_harvest, soil
from app.config import WEATHER_API_KEY, FRONTEND_URL


# ── Startup / Shutdown ───────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ChromaDB collections once when server starts."""
    print("🌶  CiliGuide backend starting...")
    init_chromadb()
    print("✅  ChromaDB ready")
    yield
    print("🛑  CiliGuide backend shutting down")


# ── App ──────────────────────────────────────────────────────
app = FastAPI(
    title="CiliGuide API",
    description="Chili cultivation assistant — RAG + Ollama",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────
app.include_router(advisory.router,     prefix="/api", tags=["Advisory"])
app.include_router(disease.router,      prefix="/api", tags=["Disease"])
app.include_router(fertilizer.router,   prefix="/api", tags=["Fertilizer"])
app.include_router(post_harvest.router, prefix="/api", tags=["Post Harvest"])
app.include_router(soil.router,         prefix="/api", tags=["Soil"])


# ── Health check ─────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "message": "CiliGuide API is running"}


# ── Weather proxy — API key hidden from frontend ──────────────
@app.get("/api/weather/city")
async def weather_by_city(city: str = Query(..., description="City name")):
    """Proxy: fetch weather by city. API key stays on server."""
    async with httpx.AsyncClient() as client:
        weather  = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"q": city, "units": "metric", "appid": WEATHER_API_KEY}
        )
        forecast = await client.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            params={"q": city, "units": "metric", "appid": WEATHER_API_KEY}
        )
    return {"weather": weather.json(), "forecast": forecast.json()}


@app.get("/api/weather/coords")
async def weather_by_coords(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude")
):
    """Proxy: fetch weather by coordinates. API key stays on server."""
    async with httpx.AsyncClient() as client:
        weather  = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": lat, "lon": lon, "units": "metric", "appid": WEATHER_API_KEY}
        )
        forecast = await client.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            params={"lat": lat, "lon": lon, "units": "metric", "appid": WEATHER_API_KEY}
        )
    return {"weather": weather.json(), "forecast": forecast.json()}
