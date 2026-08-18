from app.models.schemas import AssistantResponse
from app.services.llm_service import LlmService
from app.services.query_pipeline import QueryPipeline
from app.services.speech_service import SpeechService


class AssistantService:
    def __init__(self) -> None:
        self.speech_service = SpeechService()
        self.pipeline = QueryPipeline()
        self.llm_service = LlmService()

    async def respond(self, audio_bytes: bytes | None, transcript_hint: str) -> AssistantResponse:
        transcript = await self.speech_service.transcribe(audio_bytes=audio_bytes, transcript_hint=transcript_hint)
        normalized_query = self.pipeline.normalize(transcript)
        expanded_queries = self.pipeline.expand(normalized_query) if normalized_query else []
        retrieved_chunks = self.pipeline.retrieve(expanded_queries)
        reranked_chunks = self.pipeline.rerank(normalized_query, retrieved_chunks)
        confidence = self.pipeline.confidence(reranked_chunks)
        should_escalate = self.pipeline.should_escalate(confidence)
        answer = await self.llm_service.answer(
            query=normalized_query or transcript,
            chunks=reranked_chunks,
            should_escalate=should_escalate,
        )
        return AssistantResponse(
            transcript=transcript,
            normalized_query=normalized_query,
            expanded_queries=expanded_queries,
            answer=answer,
            confidence=confidence,
            should_escalate=should_escalate,
            citations=[chunk.title for chunk in reranked_chunks],
            retrieved_chunks=reranked_chunks,
            pipeline_mode="advanced",
        )
