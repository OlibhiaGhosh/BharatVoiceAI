import type { AssistantResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

export async function sendVoiceRequest(formData: FormData): Promise<AssistantResponse> {
  const response = await fetch(`${API_BASE}/assistant/respond`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error("Assistant request failed.");
  }
  return response.json();
}

export async function uploadKnowledge(formData: FormData): Promise<void> {
  const response = await fetch(`${API_BASE}/assistant/knowledge`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error("Knowledge upload failed.");
  }
}
