import httpx

from app.core.config import get_settings
from app.models.schemas import KnowledgeChunk


class LlmService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def answer(self, query: str, chunks: list[KnowledgeChunk], should_escalate: bool) -> str:
        if should_escalate:
            return (
                "I do not have enough reliable evidence to answer that safely right now. "
                "Please connect the customer to a human support agent."
            )
        if not chunks:
            return "I could not find a matching support policy yet. Please add more knowledge base content."
        if not self.settings.openrouter_api_key:
            return self._local_answer(query, chunks)
        prompt = self._build_prompt(query, chunks)
        headers = {
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.settings.openrouter_model,
            "messages": [
                {
                    "role": "system",
                    "content": "Answer only from the provided support context. If uncertain, say that escalation is needed.",
                },
                {"role": "user", "content": prompt},
            ],
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(self.settings.openrouter_url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"].strip()

    def _local_answer(self, query: str, chunks: list[KnowledgeChunk]) -> str:
        top = chunks[0]
        return (
            f"Based on {top.title}, here is the best grounded answer for '{query}': "
            f"{top.content}"
        )

    def _build_prompt(self, query: str, chunks: list[KnowledgeChunk]) -> str:
        context = "\n\n".join(
            f"[{chunk.title}] {chunk.content}" for chunk in chunks
        )
        return f"Query: {query}\n\nContext:\n{context}\n\nReturn a concise customer support answer."
