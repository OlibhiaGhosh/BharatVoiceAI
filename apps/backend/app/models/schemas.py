from pydantic import BaseModel, Field


class KnowledgeChunk(BaseModel):
    id: str
    title: str
    content: str
    language: str = "en"
    tags: list[str] = Field(default_factory=list)
    source: str = "seed"
    score: float = 0.0


class AssistantResponse(BaseModel):
    transcript: str
    normalized_query: str
    expanded_queries: list[str]
    answer: str
    confidence: float
    should_escalate: bool
    citations: list[str]
    retrieved_chunks: list[KnowledgeChunk]
    pipeline_mode: str


class KnowledgeUploadResponse(BaseModel):
    status: str
    document_id: str
    total_documents: int
