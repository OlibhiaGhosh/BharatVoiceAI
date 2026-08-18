import re
from collections import Counter

from app.core.config import get_settings
from app.models.schemas import KnowledgeChunk
from app.services.knowledge_store import KnowledgeStore


FILLER_TERMS = {
    "please",
    "actually",
    "basically",
    "hello",
    "hi",
    "hey",
    "uh",
    "um",
}

SYNONYMS = {
    "refund": ["refund status", "money back", "return refund"],
    "bill": ["billing", "invoice", "payment issue"],
    "order": ["shipment", "tracking", "delivery status"],
    "language": ["translation", "multilingual", "hindi english"],
}


class QueryPipeline:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.store = KnowledgeStore()

    def normalize(self, query: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9\s-]", " ", query.lower())
        tokens = [token for token in cleaned.split() if token and token not in FILLER_TERMS]
        return " ".join(tokens).strip()

    def expand(self, normalized_query: str) -> list[str]:
        expansions = {normalized_query}
        for token in normalized_query.split():
            for synonym in SYNONYMS.get(token, []):
                expansions.add(f"{normalized_query} {synonym}".strip())
        return list(expansions)

    def retrieve(self, expanded_queries: list[str], limit: int = 3) -> list[KnowledgeChunk]:
        chunks = self.store.list_chunks()
        scored: list[KnowledgeChunk] = []
        for chunk in chunks:
            score = self._score_chunk(chunk, expanded_queries)
            if score > 0:
                scored.append(chunk.model_copy(update={"score": round(score, 3)}))
        scored.sort(key=lambda item: item.score, reverse=True)
        return scored[:limit]

    def rerank(self, query: str, chunks: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
        reranked: list[KnowledgeChunk] = []
        query_terms = set(query.split())
        for chunk in chunks:
            title_overlap = len(query_terms.intersection(set(chunk.title.lower().split())))
            tag_overlap = len(query_terms.intersection(set(chunk.tags)))
            bonus = (title_overlap * 0.2) + (tag_overlap * 0.15)
            reranked.append(chunk.model_copy(update={"score": round(chunk.score + bonus, 3)}))
        reranked.sort(key=lambda item: item.score, reverse=True)
        return reranked

    def confidence(self, chunks: list[KnowledgeChunk]) -> float:
        if not chunks:
            return 0.0
        return min(1.0, round(chunks[0].score, 3))

    def should_escalate(self, confidence: float) -> bool:
        return confidence < self.settings.confidence_threshold

    def _score_chunk(self, chunk: KnowledgeChunk, expanded_queries: list[str]) -> float:
        content = f"{chunk.title} {chunk.content} {' '.join(chunk.tags)}".lower()
        content_terms = Counter(content.split())
        best = 0.0
        for query in expanded_queries:
            score = 0.0
            for term in query.split():
                score += content_terms.get(term, 0) * 0.18
                if term in chunk.tags:
                    score += 0.24
            if any(tag in query for tag in chunk.tags):
                score += 0.1
            best = max(best, score)
        return best
