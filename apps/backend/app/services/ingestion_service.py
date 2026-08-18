from app.models.schemas import KnowledgeUploadResponse
from app.services.knowledge_store import KnowledgeStore


class IngestionService:
    def __init__(self) -> None:
        self.store = KnowledgeStore()

    def add_document(self, title: str, content: str, language: str, tags: list[str]) -> KnowledgeUploadResponse:
        chunk = self.store.add_chunk(title=title, content=content, language=language, tags=tags)
        total_documents = len(self.store.list_chunks())
        return KnowledgeUploadResponse(
            status="stored",
            document_id=chunk.id,
            total_documents=total_documents,
        )
