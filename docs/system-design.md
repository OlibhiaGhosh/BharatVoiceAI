# BharatVoiceAI System Design

## Goal

Build a multilingual customer support assistant that accepts voice input, turns it into text, retrieves grounded company knowledge, and returns safe answers.

## Context

The project is designed around a deployable stack:

- Frontend: React + Vite + Tailwind CSS
- Backend: Fastify + TypeScript
- Speech-to-text: Sarvam Saaras v3 with browser speech fallback
- Text-to-speech: Sarvam Bulbul v3
- Relational data: Neon Postgres with Drizzle ORM
- Vector store: Qdrant
- LLM: Sarvam chat completions
- Hosting target: Cloudflare Pages + Render

## High-Level Architecture

```text
Browser
  -> records audio or uses browser speech recognition
  -> sends audio + transcript hint to Fastify

Fastify API
  -> Sarvam STT: multilingual transcription
  -> QueryPipeline: normalize -> expand -> Qdrant retrieve -> rerank -> confidence gate
  -> Sarvam chat: grounded answer generation
  -> Sarvam TTS: optional voice reply
  -> returns transcript, evidence, confidence, answer, escalation flag, optional audio

Knowledge Layer
  -> Neon Postgres for knowledge metadata and conversation logs
  -> Qdrant for vector search
  -> Seeded collection for local/demo mode
  -> Upload endpoint for new knowledge
```

## Final Pipeline

1. Capture user voice in the browser.
2. Transcribe with Sarvam when configured.
3. Normalize the transcript to protect IDs, remove filler, and standardize casing.
4. Expand the query into alternate phrasings.
5. Retrieve candidate chunks from Qdrant.
6. Rerank candidates by question-answer fitness.
7. Apply confidence thresholding.
8. Generate an answer from Sarvam chat using only retrieved evidence.
9. Optionally synthesize the answer through Sarvam TTS.
10. Escalate if confidence is too low.

## Progressive Branch Design

- `initial`: speech to text, basic retrieval, simple answering
- `feat1`: repo scaffold and environment setup
- `feat2`: Fastify backend health, config, and TypeScript skeleton
- `feat3`: basic STT to simple retrieval endpoint
- `feat4`: frontend voice UI and transcript rendering
- `feat5`: Neon + Drizzle schema and repository layer
- `feat6`: Qdrant retrieval primitives
- `feat7`: advanced retrieval, reranking, and confidence gating
- `feat8`: final documentation and delivery polish
- `final`: cleaned integrated product state

## Data Model

### Knowledge chunk

- `id`
- `title`
- `content`
- `language`
- `tags`
- `source`

### Assistant response

- `transcript`
- `normalizedQuery`
- `expandedQueries`
- `answer`
- `confidence`
- `shouldEscalate`
- `citations`
- `retrievedChunks`
- `audioBase64`

## Deployment Notes

- Frontend can be deployed to Cloudflare Pages as a static app.
- Backend can be deployed on Render or Railway as a Node web service.
- Neon stores relational data and Drizzle manages schema changes.
- Qdrant stores vector embeddings and retrieval payloads.
- If Sarvam credentials are missing, browser speech and local fallback responses still keep the demo usable.
