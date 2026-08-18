# BharatVoiceAI System Design

## Goal

Build a multilingual customer support assistant that accepts voice input, turns it into text, retrieves grounded company knowledge, and returns safe answers.

## Context

The project is designed around a deployable stack:

- Frontend: React + Vite + Tailwind CSS
- Backend: FastAPI
- Speech-to-text: ElevenLabs STT with browser speech fallback
- Retrieval store: Supabase `pgvector` in production, JSON-backed local store in development
- LLM: OpenRouter in production, local templated fallback in development
- Hosting target: Cloudflare Pages + Render

## High-Level Architecture

```text
Browser
  -> records audio or uses browser speech recognition
  -> sends audio + transcript hint to FastAPI

FastAPI
  -> SpeechService: ElevenLabs transcription
  -> QueryPipeline: normalize -> expand -> hybrid retrieve -> rerank -> confidence gate
  -> AnswerService: grounded prompt to OpenRouter or local fallback
  -> returns transcript, evidence, confidence, answer, escalation flag

Knowledge Layer
  -> Sample JSON corpus for local development
  -> Supabase pgvector for deployed mode
  -> Upload endpoint for new documents
```

## Final Pipeline

1. Capture user voice in the browser.
2. Transcribe with ElevenLabs when configured.
3. Normalize the transcript to protect IDs, remove filler, and standardize casing.
4. Expand the query into alternate phrasings.
5. Retrieve candidate chunks with:
   - lexical similarity
   - semantic tag overlap
   - keyword boosts for IDs and domain terms
6. Rerank candidates by question-answer fitness.
7. Apply confidence thresholding.
8. Generate an answer only from retrieved evidence.
9. Escalate if confidence is too low.

## Progressive Branch Design

- `initial`: speech to text, basic retrieval, simple answering
- `feat1`: repo scaffold and environment setup
- `feat2`: backend health, config, and sample corpus
- `feat3`: basic RAG service and answer endpoint
- `feat4`: frontend voice UI and transcript rendering
- `feat5`: ElevenLabs and OpenRouter provider integration
- `feat6`: query normalization and expansion
- `feat7`: hybrid retrieval and reranking
- `feat8`: confidence gating, upload ingestion, and observability-ready response metadata
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
- `normalized_query`
- `expanded_queries`
- `answer`
- `confidence`
- `should_escalate`
- `citations`
- `retrieved_chunks`

## Deployment Notes

- Frontend can be deployed to Cloudflare Pages as a static app.
- Backend can be deployed on Render as a Docker or Python web service.
- Supabase can store vectors, uploads, and optional auth records.
- If ElevenLabs or OpenRouter quotas run out, local fallbacks still keep the demo working.
