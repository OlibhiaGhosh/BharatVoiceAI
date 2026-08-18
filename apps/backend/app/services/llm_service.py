from app.models.schemas import KnowledgeChunk


class LlmService:
    async def answer(self, query: str, chunks: list[KnowledgeChunk]) -> str:
        if not chunks:
            return "I could not find a matching answer in the knowledge base yet."
        top = chunks[0]
        return f"Based on {top.title}: {top.content}"
