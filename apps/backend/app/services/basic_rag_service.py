from collections import Counter

from app.models.schemas import KnowledgeChunk
from app.services.knowledge_store import KnowledgeStore


class BasicRagService:
    def __init__(self) -> None:
        self.store = KnowledgeStore()

    def retrieve(self, query: str, limit: int = 3) -> list[KnowledgeChunk]:
        query_terms = query.lower().split()
        results: list[KnowledgeChunk] = []
        for chunk in self.store.list_chunks():
            content = f"{chunk.title} {chunk.content} {' '.join(chunk.tags)}".lower()
            content_terms = Counter(content.split())
            score = sum(content_terms.get(term, 0) * 0.2 for term in query_terms)
            if score > 0:
                results.append(chunk.model_copy(update={"score": round(score, 3)}))
        results.sort(key=lambda item: item.score, reverse=True)
        return results[:limit]
