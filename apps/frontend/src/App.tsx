import { useEffect, useRef, useState } from "react";

import { sendVoiceRequest, uploadKnowledge } from "./api";
import type { AssistantResponse } from "./types";

type SpeechRecognitionCtor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function App() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptHint, setTranscriptHint] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("en-IN");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeTags, setKnowledgeTags] = useState("");

  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!response?.audioBase64) {
      return;
    }
    const audio = new Audio(`data:audio/wav;base64,${response.audioBase64}`);
    void audio.play().catch(() => undefined);
  }, [response]);

  async function startRecording() {
    setError("");
    setResponse(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = async () => {
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      await submitAudio(audioBlob);
      recorder.stream.getTracks().forEach((track) => track.stop());
    };
    recorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
    startBrowserSpeech();
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
  }

  function startBrowserSpeech() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const latest = event.results[event.results.length - 1];
      setTranscriptHint(latest[0].transcript);
    };
    recognition.start();
    if (recorderRef.current) {
      recorderRef.current.onstop = async () => {
        recognition.stop();
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await submitAudio(audioBlob);
        recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      };
    }
  }

  async function submitAudio(audioBlob: Blob) {
    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("audio", audioBlob, "voice.webm");
      formData.append("transcriptHint", transcriptHint);
      formData.append("preferredLanguage", preferredLanguage);
      formData.append("includeAudio", String(includeAudio));
      const data = await sendVoiceRequest(formData);
      setResponse(data);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleKnowledgeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError("");
      await uploadKnowledge({
        title: knowledgeTitle,
        content: knowledgeContent,
        language: preferredLanguage,
        tags: knowledgeTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setKnowledgeTitle("");
      setKnowledgeContent("");
      setKnowledgeTags("");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload knowledge.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-700/30 via-slate-900 to-teal-900/60 p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-[0.35em] text-amber-300">BharatVoiceAI</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight">
            Voice-first customer support with a grounded RAG pipeline.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-300">
            Record a customer question, review the transcript, and inspect how the assistant retrieved evidence before answering.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-2xl font-semibold">Voice Console</h2>
            <p className="mt-2 text-sm text-slate-300">
              Use browser speech recognition as a fast transcript hint, or let the backend call Sarvam STT and TTS if configured.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                className="rounded-full bg-amber-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-amber-400"
                disabled={isRecording || isLoading}
                onClick={startRecording}
              >
                Start Recording
              </button>
              <button
                className="rounded-full border border-white/20 px-5 py-3 font-medium transition hover:bg-white/10"
                disabled={!isRecording}
                onClick={stopRecording}
              >
                Stop Recording
              </button>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-900/80 p-4">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Transcript Hint</p>
              <p className="mt-3 min-h-16 text-slate-100">{transcriptHint || "Your live transcript will appear here."}</p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">
                Preferred Language
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                  value={preferredLanguage}
                  onChange={(event) => setPreferredLanguage(event.target.value)}
                >
                  <option value="en-IN">English</option>
                  <option value="hi-IN">Hindi</option>
                  <option value="bn-IN">Bengali</option>
                </select>
              </label>
              <label className="mt-7 flex items-center gap-3 text-sm text-slate-300">
                <input
                  checked={includeAudio}
                  onChange={(event) => setIncludeAudio(event.target.checked)}
                  type="checkbox"
                />
                Generate Sarvam TTS reply
              </label>
            </div>

            {isLoading ? <p className="mt-4 text-amber-300">Processing customer audio...</p> : null}
            {error ? <p className="mt-4 text-rose-300">{error}</p> : null}
          </div>

          <form className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur" onSubmit={handleKnowledgeSubmit}>
            <h2 className="text-2xl font-semibold">Knowledge Upload</h2>
            <p className="mt-2 text-sm text-slate-300">
              Add FAQ, policies, or operational notes to strengthen the assistant.
            </p>
            <label className="mt-6 block text-sm text-slate-300">
              Title
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                value={knowledgeTitle}
                onChange={(event) => setKnowledgeTitle(event.target.value)}
              />
            </label>
            <label className="mt-4 block text-sm text-slate-300">
              Content
              <textarea
                className="mt-2 min-h-40 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                value={knowledgeContent}
                onChange={(event) => setKnowledgeContent(event.target.value)}
              />
            </label>
            <label className="mt-4 block text-sm text-slate-300">
              Tags
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                placeholder="refund, billing, delivery"
                value={knowledgeTags}
                onChange={(event) => setKnowledgeTags(event.target.value)}
              />
            </label>
            <button className="mt-6 rounded-full bg-teal-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-teal-400">
              Add to Knowledge Base
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="text-2xl font-semibold">Assistant Output</h2>
          {response ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <article className="rounded-2xl bg-slate-900/80 p-5">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Transcript</p>
                <p className="mt-3">{response.transcript || "No transcript available."}</p>
                <p className="mt-5 text-sm uppercase tracking-[0.25em] text-slate-400">Normalized Query</p>
                <p className="mt-3">{response.normalizedQuery || "No normalized query."}</p>
                <p className="mt-5 text-sm uppercase tracking-[0.25em] text-slate-400">Expanded Queries</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {response.expandedQueries.map((query) => (
                    <li key={query}>{query}</li>
                  ))}
                </ul>
              </article>

              <article className="rounded-2xl bg-slate-900/80 p-5">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Answer</p>
                <p className="mt-3 leading-7">{response.answer}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <span className="rounded-full bg-white/10 px-4 py-2 text-sm">
                    Confidence: {response.confidence.toFixed(2)}
                  </span>
                  <span className="rounded-full bg-white/10 px-4 py-2 text-sm">
                    Mode: {response.pipelineMode}
                  </span>
                  <span className="rounded-full bg-white/10 px-4 py-2 text-sm">
                    Escalate: {response.shouldEscalate ? "Yes" : "No"}
                  </span>
                </div>
              </article>

              <article className="rounded-2xl bg-slate-900/80 p-5 lg:col-span-2">
                <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Retrieved Evidence</p>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {response.retrievedChunks.map((chunk) => (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4" key={chunk.id}>
                      <p className="font-semibold">{chunk.title}</p>
                      <p className="mt-2 text-sm text-slate-300">{chunk.content}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                        Score {chunk.score.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ) : (
            <p className="mt-4 text-slate-300">Record a voice query to see transcript, reasoning metadata, and answer output.</p>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
