from fastapi import APIRouter, Form

from app.models.schemas import AssistantResponse
from app.services.assistant_service import AssistantService


router = APIRouter()
assistant_service = AssistantService()


@router.post("/respond", response_model=AssistantResponse)
async def respond(transcript_hint: str = Form(default="")) -> AssistantResponse:
    return await assistant_service.respond(transcript_hint=transcript_hint)
