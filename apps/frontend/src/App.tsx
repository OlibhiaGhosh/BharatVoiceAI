import { useState } from "react";

import { sendTranscript } from "./api";
import type { AssistantResponse } from "./types";

type SpeechRecognitionCtor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function App() {
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function startListening() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Browser speech recognition is not available here.");
      return;
    }
    setError("");
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const value = event.results[0][0].transcript;
      setTranscript(value);
    };
    recognition.start();
  }

  async function submitTranscript() {
    try {
      setLoading(true);
      const data = await sendTranscript(transcript);
      setResponse(data);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Failed to submit transcript.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <section className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-700/30 to-teal-900/40 p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Initial Voice Demo</p>
          <h1 className="mt-4 text-4xl font-semibold">BharatVoiceAI basic voice-to-text and RAG flow</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Capture a spoken query, review the transcript, and send it through the simple retrieval pipeline.
          </p>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-2xl font-semibold">Voice Capture</h2>
            <button className="mt-5 rounded-full bg-amber-400 px-5 py-3 font-medium text-slate-950" onClick={startListening}>
              Start Listening
            </button>
            <textarea
              className="mt-6 min-h-40 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
            />
            <button
              className="mt-4 rounded-full bg-teal-400 px-5 py-3 font-medium text-slate-950"
              disabled={!transcript || loading}
              onClick={submitTranscript}
            >
              Send to Assistant
            </button>
            {loading ? <p className="mt-4 text-amber-300">Generating answer...</p> : null}
            {error ? <p className="mt-4 text-rose-300">{error}</p> : null}
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-2xl font-semibold">Assistant Output</h2>
            {response ? (
              <>
                <p className="mt-5 text-sm uppercase tracking-[0.3em] text-slate-400">Answer</p>
                <p className="mt-3 leading-7">{response.answer}</p>
                <p className="mt-5 text-sm uppercase tracking-[0.3em] text-slate-400">Evidence</p>
                <ul className="mt-3 space-y-3 text-sm text-slate-300">
                  {response.retrieved_chunks.map((chunk) => (
                    <li key={chunk.id}>
                      <span className="font-semibold text-slate-100">{chunk.title}</span>: {chunk.content}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-5 text-slate-300">No answer yet. Speak or type a customer support query first.</p>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}

export default App;
