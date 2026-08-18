import json
from pathlib import Path
from uuid import uuid4

from app.models.schemas import KnowledgeChunk


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DATA_FILE = DATA_DIR / "knowledge_base.json"


SEED_DOCUMENTS = [
    {
        "id": "refund-policy",
        "title": "Refund Policy",
        "content": "Refunds are usually processed within 5 to 7 business days after the return is approved. Customers should keep their order ID ready when asking for a refund status.",
        "language": "en",
        "tags": ["refund", "returns", "orders"],
        "source": "seed",
    },
    {
        "id": "billing-support",
        "title": "Billing Support",
        "content": "For billing issues, customers can confirm the last successful transaction date, payment mode, and invoice email. Duplicate charges should be escalated if the bank confirms settlement.",
        "language": "en",
        "tags": ["billing", "payments", "invoice"],
        "source": "seed",
    },
    {
        "id": "order-tracking",
        "title": "Order Tracking",
        "content": "Order tracking updates are available within 24 hours of dispatch. If the package is marked delivered but the customer did not receive it, the case must be escalated immediately.",
        "language": "en",
        "tags": ["orders", "tracking", "delivery"],
        "source": "seed",
    },
    {
        "id": "multilingual-support",
        "title": "Language Handling",
        "content": "The assistant should reply in the language used by the customer whenever enough evidence is available. When language confidence is low, keep the answer simple and ask a clarifying question.",
        "language": "en",
        "tags": ["language", "support", "clarification"],
        "source": "seed",
    },
]


class KnowledgeStore:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if not DATA_FILE.exists():
            DATA_FILE.write_text(json.dumps(SEED_DOCUMENTS, indent=2), encoding="utf-8")

    def list_chunks(self) -> list[KnowledgeChunk]:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return [KnowledgeChunk(**item) for item in raw]

    def add_chunk(self, title: str, content: str, language: str, tags: list[str]) -> KnowledgeChunk:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        item = {
            "id": str(uuid4()),
            "title": title,
            "content": content,
            "language": language,
            "tags": tags,
            "source": "upload",
        }
        raw.append(item)
        DATA_FILE.write_text(json.dumps(raw, indent=2), encoding="utf-8")
        return KnowledgeChunk(**item)
