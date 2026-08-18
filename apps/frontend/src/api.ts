import type { AssistantResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

export async function sendTranscript(transcriptHint: string): Promise<AssistantResponse> {
  const formData = new FormData();
  formData.append("transcript_hint", transcriptHint);
  const response = await fetch(`${API_BASE}/assistant/respond`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error("Assistant request failed.");
  }
  return response.json();
}
