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

Backend supports these optional variables:

- `DATABASE_URL`
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `SARVAM_API_KEY`
- `SARVAM_CHAT_MODEL`
- `SARVAM_STT_MODEL`
- `SARVAM_TTS_MODEL`
- `APP_ENV`
