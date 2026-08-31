import { useEffect, useRef, useState } from "react";

import { sendVoiceRequest, uploadKnowledge, uploadKnowledgeSource } from "./api";
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "processing" | "stopped">("idle");
  const [transcriptHint, setTranscriptHint] = useState("");
  const [pendingAudio, setPendingAudio] = useState<Blob | null>(null);
  const [preferredLanguage, setPreferredLanguage] = useState("en-IN");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [replyAudioUrl, setReplyAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeTags, setKnowledgeTags] = useState("");
  const [knowledgeSourceType, setKnowledgeSourceType] = useState<"manual" | "website" | "youtube" | "pdf">("manual");
  const [knowledgeUrl, setKnowledgeUrl] = useState("");
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [knowledgeState, setKnowledgeState] = useState<"idle" | "uploading" | "success">("idle");

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!response?.audioBase64) {
      setReplyAudioUrl("");
      return;
    }
    const url = `data:audio/wav;base64,${response.audioBase64}`;
    setReplyAudioUrl(url);
    const audio = new Audio(url);
    void audio.play().catch(() => undefined);
  }, [response]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  async function startRecording() {
    if (isRecording || isLoading) {
      return;
    }

    try {
      setError("");
      setResponse(null);
      setPendingAudio(null);
      setTranscriptHint("");
      setRecordingState("recording");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        recognitionRef.current?.stop();
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setPendingAudio(audioBlob);
        setIsRecording(false);
        setRecordingState("stopped");
        recorder.stream.getTracks().forEach((track) => track.stop());
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      startBrowserSpeech();
    } catch (recordingError) {
      setRecordingState("idle");
      setError(recordingError instanceof Error ? recordingError.message : "Microphone access could not be started.");
    }
  }

  function stopRecording() {
    if (!isRecording || isLoading) {
      return;
    }
    recorderRef.current?.stop();
  }

  function startBrowserSpeech() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.lang = preferredLanguage;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(
        { length: event.results.length - event.resultIndex },
        (_, index) => event.results[event.resultIndex + index][0].transcript,
      ).join(" ");
      setTranscriptHint((current) => [current, transcript].join(" ").trim());
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  async function submitAudio() {
    if (!pendingAudio || isLoading) {
      return;
    }

    try {
      setError("");
      setIsLoading(true);
      setRecordingState("processing");
      const formData = new FormData();
      formData.append("audio", pendingAudio, "voice.webm");
      formData.append("transcriptHint", transcriptHint.trim());
      formData.append("preferredLanguage", preferredLanguage);
      formData.append("includeAudio", String(includeAudio));
      const data = await sendVoiceRequest(formData);
      setResponse(data);
      setPendingAudio(null);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
      setRecordingState("idle");
    }
  }
  function playReplyAudio() {
    if (!response?.answer) {
      return;
    }
    if (replyAudioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => undefined);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(response.answer);
    utterance.lang = preferredLanguage;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function handleKnowledgeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (knowledgeState === "uploading") {
      return;
    }
    let wasSuccessful = false;
    try {
      setError("");
      setUploadMessage("");
      setKnowledgeState("uploading");
      const tags = knowledgeTags.split(",").map((tag) => tag.trim()).filter(Boolean);

      if (knowledgeSourceType === "manual") {
        await uploadKnowledge({
          title: knowledgeTitle,
          content: knowledgeContent,
          language: preferredLanguage,
          tags,
        });
      } else {
        const formData = new FormData();
        formData.append("sourceType", knowledgeSourceType);
        formData.append("title", knowledgeTitle);
        formData.append("url", knowledgeUrl);
        formData.append("language", preferredLanguage);
        formData.append("tags", tags.join(","));
        if (knowledgeFile) {
          formData.append("file", knowledgeFile);
        }
        await uploadKnowledgeSource(formData);
      }

      setKnowledgeTitle("");
      setKnowledgeContent("");
      setKnowledgeTags("");
      setKnowledgeUrl("");
      setKnowledgeFile(null);
      wasSuccessful = true;
      setKnowledgeState("success");
      setUploadMessage(`Knowledge source added successfully from ${knowledgeSourceType}.`);
    } catch (uploadError) {
      setKnowledgeState("idle");
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload knowledge.");
    } finally {
      if (!wasSuccessful) {
        setKnowledgeState("idle");
      }
    }
  }

  function getRecordingButtonLabel() {
    if (recordingState === "recording") {
      return "Recording...";
    }
    if (recordingState === "processing") {
      return "Processing...";
    }
    if (recordingState === "stopped") {
      return "Stopped";
    }
    return "Start Recording";
  }

  function getStopButtonLabel() {
    if (recordingState === "processing") {
      return "Please Wait";
    }
    if (recordingState === "stopped") {
      return "Stopped";
    }
    return "Stop Recording";
  }

  function getKnowledgeButtonLabel() {
    if (knowledgeState === "uploading") {
      return "Adding to Knowledge Base...";
    }
    if (knowledgeState === "success") {
      return "Added Successfully";
    }
    return "Add to Knowledge Base";
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
              Sarvam verifies the final recording for retrieval. Browser recognition is only a live preview that you can edit before searching.
            </p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`record-status-icon ${
                    recordingState === "recording"
                      ? "record-status-icon-recording"
                      : recordingState === "stopped"
                        ? "record-status-icon-stopped"
                        : recordingState === "processing"
                          ? "record-status-icon-processing"
                          : "record-status-icon-idle"
                  }`}
                >
                  {recordingState === "stopped" ? "■" : recordingState === "processing" ? "◌" : "●"}
                </span>
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Recording Status</p>
                  <p className="mt-1 text-base text-slate-100">
                    {recordingState === "recording"
                      ? "Recording in progress"
                      : recordingState === "stopped"
                        ? "Recording stopped"
                        : recordingState === "processing"
                          ? "Processing voice request"
                          : "Ready to record"}
                  </p>
                </div>
              </div>
              <div className={`voice-bars mt-4 ${recordingState}`}>
                {Array.from({ length: 9 }).map((_, index) => (
                  <span className="voice-bar" key={index} style={{ animationDelay: `${index * 90}ms` }} />
                ))}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRecording || isLoading}
                onClick={startRecording}
              >
                <span aria-hidden="true">{recordingState === "processing" ? "◌" : "🎙"}</span>
                {getRecordingButtonLabel()}
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isRecording || isLoading}
                onClick={stopRecording}
              >
                <span aria-hidden="true">■</span>
                {getStopButtonLabel()}
              </button>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-900/80 p-4">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Transcript Preview</p>
              {pendingAudio ? (
                <textarea
                  className="mt-3 min-h-24 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none"
                  value={transcriptHint}
                  onChange={(event) => setTranscriptHint(event.target.value)}
                  placeholder="Review or correct the browser preview. Sarvam will verify this from the recording."
                />
              ) : (
                <p className="mt-3 min-h-16 text-slate-100">{transcriptHint || "Your live transcript will appear here."}</p>
              )}
              {pendingAudio ? (
                <button
                  className="mt-4 rounded-full bg-teal-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  onClick={submitAudio}
                  type="button"
                >
                  Ask Assistant with Sarvam STT
                </button>
              ) : null}
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
                Speak the answer aloud with Sarvam TTS
              </label>
            </div>

            {isLoading ? <p className="mt-4 text-amber-300">Voice query received. Processing the recording now.</p> : null}
            {error ? <p className="mt-4 text-rose-300">{error}</p> : null}
          </div>

          <form className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur" onSubmit={handleKnowledgeSubmit}>
            <h2 className="text-2xl font-semibold">Knowledge Upload</h2>
            <p className="mt-2 text-sm text-slate-300">
              Add FAQ text directly, or ingest a website, YouTube transcript, or PDF into the RAG knowledge base.
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Upload Status</p>
              <p className="mt-2 text-base text-slate-100">
                {knowledgeState === "uploading"
                  ? "Adding content to the knowledge base..."
                  : knowledgeState === "success"
                    ? "Knowledge added successfully."
                    : "Ready to add a new knowledge source."}
              </p>
            </div>
            <label className="mt-6 block text-sm text-slate-300">
              Source Type
              <select
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                disabled={knowledgeState === "uploading"}
                value={knowledgeSourceType}
                onChange={(event) => {
                  setKnowledgeSourceType(event.target.value as "manual" | "website" | "youtube" | "pdf");
                  setKnowledgeState("idle");
                  setUploadMessage("");
                }}
              >
                <option value="manual">Manual Text</option>
                <option value="website">Website URL</option>
                <option value="youtube">YouTube Link</option>
                <option value="pdf">PDF Upload</option>
              </select>
            </label>
            <label className="mt-6 block text-sm text-slate-300">
              Title
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                disabled={knowledgeState === "uploading"}
                value={knowledgeTitle}
                onChange={(event) => {
                  setKnowledgeTitle(event.target.value);
                  setKnowledgeState("idle");
                  setUploadMessage("");
                }}
              />
            </label>
            {knowledgeSourceType === "manual" ? (
              <label className="mt-4 block text-sm text-slate-300">
                Content
                <textarea
                  className="mt-2 min-h-40 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                  disabled={knowledgeState === "uploading"}
                  value={knowledgeContent}
                  onChange={(event) => {
                    setKnowledgeContent(event.target.value);
                    setKnowledgeState("idle");
                    setUploadMessage("");
                  }}
                />
              </label>
            ) : null}
            {knowledgeSourceType === "website" || knowledgeSourceType === "youtube" ? (
              <label className="mt-4 block text-sm text-slate-300">
                Source URL
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                  disabled={knowledgeState === "uploading"}
                  placeholder={knowledgeSourceType === "website" ? "https://example.com/help/refunds" : "https://www.youtube.com/watch?v=..."}
                  value={knowledgeUrl}
                  onChange={(event) => {
                    setKnowledgeUrl(event.target.value);
                    setKnowledgeState("idle");
                    setUploadMessage("");
                  }}
                />
              </label>
            ) : null}
            {knowledgeSourceType === "pdf" ? (
              <label className="mt-4 block text-sm text-slate-300">
                PDF File
                <input
                  accept="application/pdf"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none file:mr-4 file:rounded-full file:border-0 file:bg-teal-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-950"
                  disabled={knowledgeState === "uploading"}
                  onChange={(event) => setKnowledgeFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
            ) : null}
            <label className="mt-4 block text-sm text-slate-300">
              Tags
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 outline-none"
                disabled={knowledgeState === "uploading"}
                placeholder="refund, billing, delivery"
                value={knowledgeTags}
                onChange={(event) => {
                  setKnowledgeTags(event.target.value);
                  setKnowledgeState("idle");
                  setUploadMessage("");
                }}
              />
            </label>
            <button
              className="mt-6 rounded-full bg-teal-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={knowledgeState === "uploading"}
            >
              {getKnowledgeButtonLabel()}
            </button>
            {uploadMessage ? <p className="mt-4 text-sm text-teal-300">{uploadMessage}</p> : null}
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
                  <button
                    className="inline-flex items-center gap-2 rounded-full bg-teal-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!response?.answer}
                    onClick={playReplyAudio}
                    type="button"
                  >
                    <span aria-hidden="true">🔊</span>
                    Play Reply
                  </button>
                  {!replyAudioUrl ? <span className="rounded-full bg-white/10 px-4 py-2 text-sm">Using browser voice fallback</span> : null}
                </div>
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
      <audio className="hidden" ref={audioRef} src={replyAudioUrl} />
    </main>
  );
}

export default App;

