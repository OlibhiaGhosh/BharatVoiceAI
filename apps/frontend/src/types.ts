export type RetrievedChunk = {
  id: string;
  title: string;
  content: string;
  language: string;
  tags: string[];
  source: string;
  score: number;
};

export type AssistantResponse = {
  transcript: string;
  normalized_query: string;
  expanded_queries: string[];
  answer: string;
  confidence: number;
  should_escalate: boolean;
  citations: string[];
  retrieved_chunks: RetrievedChunk[];
  pipeline_mode: string;
};
