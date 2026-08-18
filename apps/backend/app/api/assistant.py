from fastapi import APIRouter, File, Form, UploadFile

from app.models.schemas import AssistantResponse
from app.services.assistant_service import AssistantService


router = APIRouter()
assistant_service = AssistantService()


@router.post("/respond", response_model=AssistantResponse)
async def respond(
    transcript_hint: str = Form(default=""),
    audio: UploadFile | None = File(default=None),
) -> AssistantResponse:
    audio_bytes = await audio.read() if audio else None
    return await assistant_service.respond(audio_bytes=audio_bytes, transcript_hint=transcript_hint)
