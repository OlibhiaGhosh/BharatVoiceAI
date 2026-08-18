export type KnowledgeChunk = {
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
  retrievedChunks: KnowledgeChunk[];
  pipelineMode: string;
  audioBase64?: string;
};

export type ConversationRecord = {
  transcript: string;
  answer: string;
  language: string;
  confidence: number;
};
