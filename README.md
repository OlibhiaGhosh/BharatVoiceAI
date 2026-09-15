# BharatVoiceAI

BharatVoiceAI is a voice-first customer support assistant with a clean MVP path and an advanced RAG pipeline.

## Monorepo layout

- `apps/frontend` - React client
- `apps/backend` - Fastify + TypeScript API
- `docs` - architecture and delivery notes

## Core flows

- `initial` branch: voice to text -> basic retrieval -> answer
- `final` branch: Sarvam STT/TTS + Neon/Drizzle + Qdrant + advanced retrieval pipeline

## Quick start

### Backend

```bash
cd apps/backend
npm install
npm run dev
```

### Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

## Environment variables

Copy `apps/backend/.env.example` to `apps/backend/.env` before starting the API.

Required for retrieval and answering:

- `GOOGLE_API_KEY` - Gemini key used for embeddings, query expansion, and answers
- `QDRANT_URL` - vector store endpoint (defaults to `http://localhost:6333`)

Optional:

- `QDRANT_API_KEY`, `QDRANT_COLLECTION`
- `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`
- `DATABASE_URL` - Neon Postgres; without it, knowledge metadata and logs stay in memory
- `SARVAM_API_KEY`, `SARVAM_STT_MODEL`, `SARVAM_TTS_MODEL`, `SARVAM_CHAT_MODEL`, `SARVAM_BASE_URL` - without a key, the browser handles speech
- `CONFIDENCE_THRESHOLD`, `FRONTEND_URL`, `APP_ENV`, `PORT`

## Knowledge sources

The Knowledge Upload panel accepts manual text, a website URL, a YouTube link, or a PDF.

YouTube ingestion reads the video through the InnerTube API and stores the caption
transcript when one can be downloaded. YouTube refuses caption downloads for some
videos and from some networks (rate limiting); in that case the video title,
description, and topics are stored instead and the UI reports exactly what happened.
Playlist and channel URLs are rejected - pass a single video link.
