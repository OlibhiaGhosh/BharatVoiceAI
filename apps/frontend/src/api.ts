import type { AssistantResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback;
}
export async function sendVoiceRequest(formData: FormData): Promise<AssistantResponse> {
  const response = await fetch(`${API_BASE}/assistant/respond`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await responseError(response, "Assistant request failed."));
  }
  return response.json();
}

export async function uploadKnowledge(payload: {
  title: string;
  content: string;
  language: string;
  tags: string[];
}): Promise<void> {
  const response = await fetch(`${API_BASE}/assistant/knowledge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Knowledge upload failed.");
  }
}

export async function uploadKnowledgeSource(formData: FormData): Promise<void> {
  const response = await fetch(`${API_BASE}/assistant/knowledge/source`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error("Knowledge source upload failed.");
  }
}

