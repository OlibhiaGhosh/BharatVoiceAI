from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.config import get_settings


settings = get_settings()

app = FastAPI(
    title="BharatVoiceAI API",
    version="1.0.0",
    description="Voice-first customer support assistant with a progressive RAG pipeline.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "BharatVoiceAI API is running."}
