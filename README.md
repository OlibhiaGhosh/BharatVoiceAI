# BharatVoiceAI

BharatVoiceAI is a voice-first customer support assistant with a clean MVP path and an advanced RAG pipeline.

## Monorepo layout

- `apps/frontend` - React client
- `apps/backend` - FastAPI API
- `docs` - architecture and delivery notes

## Core flows

- `initial` branch: voice to text -> basic retrieval -> answer
- `final` branch: advanced query normalization, expansion, hybrid retrieval, reranking, confidence gating, and admin ingestion

## Quick start

### Backend

```bash
cd apps/backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

## Environment variables

Backend supports these optional variables:

- `ELEVENLABS_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET`
- `SUPABASE_TABLE`
- `APP_ENV`
