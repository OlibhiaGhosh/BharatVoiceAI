import type { MultipartFile } from "@fastify/multipart";

import { env } from "../lib/env.js";

async function requestSarvam(path: string, init: RequestInit) {
  const response = await fetch(`${env.SARVAM_BASE_URL}${path}`, {
    ...init,
    headers: {
      "api-subscription-key": env.SARVAM_API_KEY,
      Authorization: `Bearer ${env.SARVAM_API_KEY}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Sarvam request failed with status ${response.status}: ${details}`);
  }
  return response;
}

export async function transcribeAudio(audio: MultipartFile | null, language: string, transcriptHint: string) {
  if (!audio) {
    return transcriptHint.trim();
  }
  if (!env.SARVAM_API_KEY) {
    return transcriptHint.trim();
  }
  try {
    const buffer = await audio.toBuffer();
    const formData = new FormData();
    const mimeType = audio.mimetype.split(";")[0] || "audio/webm";

    formData.append("model", env.SARVAM_STT_MODEL);
    formData.append("language_code", language || "unknown");
    formData.append("mode", "transcribe");
    formData.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      audio.filename || "voice.webm",
    );

    const response = await requestSarvam("/speech-to-text", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json() as { transcript?: string; text?: string };
    return payload.transcript?.trim() || payload.text?.trim() || transcriptHint.trim();
  } catch (error) {
    if (transcriptHint.trim()) {
      return transcriptHint.trim();
    }
    throw error;
  }
}

export async function generateAnswer(query: string, context: string, shouldEscalate: boolean) {
  if (shouldEscalate) {
    return "I do not have enough reliable evidence to answer that safely right now. Please connect the customer to a human support agent.";
  }
  if (!env.SARVAM_API_KEY) {
    return `Grounded answer for '${query}': ${context}`;
  }
  const response = await requestSarvam("/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.SARVAM_CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "Answer only from the provided support context. If the evidence is weak, recommend escalation.",
        },
        {
          role: "user",
          content: `Query: ${query}\n\nContext:\n${context}\n\nReturn a concise multilingual customer support answer.`,
        },
      ],
    }),
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? "No answer generated.";
}

export async function synthesizeSpeech(text: string, language: string) {
  if (!env.SARVAM_API_KEY) {
    return "";
  }
  const response = await requestSarvam("/text-to-speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.SARVAM_TTS_MODEL,
      text,
      language_code: language,
      speaker: "shubh",
    }),
  });
  const payload = await response.json() as { audio?: string; audios?: string[] };
  return payload.audio ?? payload.audios?.[0] ?? "";
}



