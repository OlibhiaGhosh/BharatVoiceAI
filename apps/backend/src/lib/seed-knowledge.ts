import type { KnowledgeChunk } from "../types.js";

export const seedKnowledge: Omit<KnowledgeChunk, "score">[] = [
  {
    id: "refund-policy",
    title: "Refund Policy",
    content:
      "Refunds are usually processed within 5 to 7 business days after return approval. Customers should keep their order ID ready when asking for a refund update.",
    language: "en-IN",
    tags: ["refund", "returns", "orders"],
    source: "seed",
  },
  {
    id: "billing-support",
    title: "Billing Support",
    content:
      "For billing issues, first confirm the last transaction date, payment mode, and invoice email. Duplicate charges should be escalated after bank confirmation.",
    language: "en-IN",
    tags: ["billing", "payments", "invoice"],
    source: "seed",
  },
  {
    id: "order-tracking",
    title: "Order Tracking",
    content:
      "Tracking updates become available within 24 hours of dispatch. If the package shows delivered but the customer did not receive it, escalate the case immediately.",
    language: "en-IN",
    tags: ["orders", "tracking", "delivery"],
    source: "seed",
  },
  {
    id: "multilingual-support",
    title: "Language Handling",
    content:
      "Reply in the language used by the customer whenever evidence is strong enough. When the language signal is unclear, answer simply and ask one clarifying question.",
    language: "en-IN",
    tags: ["language", "clarification", "support"],
    source: "seed",
  }
];
