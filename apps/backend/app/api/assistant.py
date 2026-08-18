from fastapi import APIRouter, File, Form, UploadFile

from app.models.schemas import AssistantResponse, KnowledgeUploadResponse
from app.services.assistant_service import AssistantService
from app.services.ingestion_service import IngestionService


router = APIRouter()
assistant_service = AssistantService()
ingestion_service = IngestionService()


@router.post("/respond", response_model=AssistantResponse)
async def respond(
    transcript_hint: str = Form(default=""),
    audio: UploadFile | None = File(default=None),
) -> AssistantResponse:
    audio_bytes = await audio.read() if audio else None
    return await assistant_service.respond(audio_bytes=audio_bytes, transcript_hint=transcript_hint)


@router.post("/knowledge", response_model=KnowledgeUploadResponse)
async def upload_knowledge(
    title: str = Form(...),
    content: str = Form(...),
    language: str = Form(default="en"),
    tags: str = Form(default=""),
) -> KnowledgeUploadResponse:
    tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]
    return ingestion_service.add_document(title=title, content=content, language=language, tags=tag_list)
