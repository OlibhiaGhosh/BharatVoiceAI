import httpx

from app.core.config import get_settings
from app.models.schemas import KnowledgeChunk


class LlmService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def answer(self, query: str, chunks: list[KnowledgeChunk]) -> str:
        if not chunks:
            return "I could not find a matching answer in the knowledge base yet."
        if self.settings.openrouter_api_key:
            return await self._remote_answer(query, chunks)
        top = chunks[0]
        return f"Based on {top.title}: {top.content}"

    async def _remote_answer(self, query: str, chunks: list[KnowledgeChunk]) -> str:
        headers = {
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }
        context = "\n\n".join(f"[{chunk.title}] {chunk.content}" for chunk in chunks)
        payload = {
            "model": self.settings.openrouter_model,
            "messages": [
                {
                    "role": "system",
                    "content": "Answer only from the provided support context. Be concise and grounded.",
                },
                {
                    "role": "user",
                    "content": f"Query: {query}\n\nContext:\n{context}\n\nReturn a customer support answer.",
                },
            ],
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(self.settings.openrouter_url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"].strip()
