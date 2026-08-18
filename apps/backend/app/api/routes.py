from fastapi import APIRouter

from app.api import assistant, health


api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
