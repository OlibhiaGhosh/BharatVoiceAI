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
  normalizedQuery: string;
  expandedQueries: string[];
  answer: string;
  confidence: number;
  shouldEscalate: boolean;
  citations: string[];
  retrievedChunks: RetrievedChunk[];
  pipelineMode: string;
  audioBase64?: string;
};

export type IngestionResult = {
  status: string;
  documentId: string;
  totalChunks: number;
  notes?: string;
};
