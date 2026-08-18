from app.models.schemas import AssistantResponse
from app.services.basic_rag_service import BasicRagService
from app.services.llm_service import LlmService
from app.services.speech_service import SpeechService


class AssistantService:
    def __init__(self) -> None:
        self.speech_service = SpeechService()
        self.rag_service = BasicRagService()
        self.llm_service = LlmService()

    async def respond(self, audio_bytes: bytes | None, transcript_hint: str) -> AssistantResponse:
        transcript = await self.speech_service.transcribe(audio_bytes=audio_bytes, transcript_hint=transcript_hint)
        retrieved_chunks = self.rag_service.retrieve(transcript)
        answer = await self.llm_service.answer(transcript, retrieved_chunks)
        confidence = retrieved_chunks[0].score if retrieved_chunks else 0.0
        return AssistantResponse(
            transcript=transcript,
            normalized_query=transcript,
            expanded_queries=[transcript] if transcript else [],
            answer=answer,
            confidence=confidence,
            should_escalate=False,
            citations=[chunk.title for chunk in retrieved_chunks],
            retrieved_chunks=retrieved_chunks,
            pipeline_mode="basic",
        )
