# Parallax - Digital Dark Spot

**Find what the information doesn't tell you.**

Parallax - Digital Dark Spot is an evidence-first research workspace built for the Shinchan Online Hackathon 2026. Give it a research question plus URLs and documents. It does not summarise them. It reports what the sources establish, what is **missing**, what **conflicts**, what looks **outdated**, and what you should **verify next**, with every finding traceable to the passage it came from.

> Don't just show users what they found. Show them what they are missing.

## What it does

| Requirement | Where it lives |
|---|---|
| Question / topic / goal, multiple URLs, PDF upload | `/research` form, `POST /api/research/{id}/sources`, `/documents` |
| Safe collection (SSRF guard, robots.txt, redirect validation, byte/time limits) | `backend/app/core/security.py`, `ingestion/fetcher.py` |
| Atomic claims with verbatim evidence + location | `analysis/claims.py` |
| Research-specific information categories | `analysis/categories.py` (LLM proposal, validated, with templated fallback) |
| Coverage matrix: COVERED / PARTIALLY_COVERED / NOT_FOUND / UNCERTAIN / NEEDS_VERIFICATION | `analysis/coverage.py` |
| Gaps worded as *potential* gaps, prioritised with a shown formula | `coverage.build_gap_findings`, `priority_for_gap` |
| Contradictions: deterministic for dates/money/numbers, optional LLM for text, scope/cycle checks first | `analysis/contradictions.py` |
| Freshness: CURRENT / POTENTIALLY_OUTDATED / UNDATED / EXPIRED / DATE_UNAVAILABLE (never uses retrieval time) | `analysis/freshness.py` |
| Evidence verification: refs exist, quote is in the source, value is in the quote | `analysis/verification.py` |
| Verification checklist (user completes, annotates, reopens) | `analysis/checklist.py`, `PATCH /api/checklist/{id}` |
| Hybrid retrieval: BM25 + vector, reciprocal rank fusion, explainable scores | `retrieval/hybrid.py`, `GET /api/research/{id}/search` |
| Provenance graph source → claim → finding → task | relational tables + `GET /graph`, `/evidence/{claim_ref}` |
| Completeness score with component breakdown | `analysis/scoring.py` |
| Live pipeline progress over WebSocket | `services/pipeline.py`, `services/events.py` |
| Demonstration mode (fictional sources, clearly labelled) | `demo/fixtures.py`, `POST /api/demo` |

## Architecture

```mermaid
flowchart LR
  U[User] --> FE[Next.js frontend]
  FE -- REST --> API[FastAPI]
  FE -- WebSocket --> API
  API --> SM[Research session manager]
  API --> ING[Ingestion: HTTPX fetch, HTML parse, PDF extract, chunking]
  API --> ORCH[LangGraph orchestrator]
  ORCH --> N1[Source collection] --> N2[Content extraction] --> N3[Evidence indexing] --> N4[Research planning]
  N4 --> N5[Claim extraction] --> N6[Freshness] --> N7[Contradictions] --> N8[Gap detection] --> N9[Evidence verification] --> N10[Checklist] --> N11[Report]
  ORCH --> LLM[LLM adapter: Gemini or OpenAI, optional]
  ORCH --> PG[(PostgreSQL + pgvector)]
  API --> PG
  API --> R[(Redis: job state, optional)]
  ORCH -.-> OBS[Langfuse / OpenTelemetry, optional]
```

Conditional execution: with no usable source the graph jumps straight to the report; with fewer than two sources contradiction analysis is skipped; a stage that fails marks its dependants as skipped with the reason, and independent stages keep going. Errors are listed in the UI and in the report's limitations section; nothing is silently dropped.

## Database

PostgreSQL with pgvector. Tables: `research_sessions`, `sources`, `source_chunks` (vector(384) + HNSW and GIN full-text indexes), `claims`, `claim_relationships` (`CLAIM_CONTRADICTS_CLAIM`, `CLAIM_CORROBORATES_CLAIM`), `information_categories`, `coverage_results`, `findings`, `verification_tasks`, `pipeline_stages`, `analysis_reports`. UUID primary keys, foreign keys with cascades, and human-readable per-session refs (`source_001`, `claim_014`, `finding_003`) that evidence references point at.

## Quick start

```bash
cp .env.example .env          # optional: add LLM_PROVIDER / LLM_MODEL / LLM_API_KEY
docker compose up --build
# frontend http://localhost:3000   API docs http://localhost:8000/docs
```

Open the app and click **Open the demo workspace**, then **Start analysis**.

Without Docker:

```bash
# backend (SQLite by default, no services needed)
cd backend && pip install -r requirements-dev.txt
uvicorn app.main:app --reload            # creates tables automatically for SQLite
# or PostgreSQL + pgvector:
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/dds alembic upgrade head

# frontend
cd frontend && npm install && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## Configuration

See `.env.example`. Nothing is required. Key variables:

| Variable | Meaning |
|---|---|
| `LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY` | `gemini`, `openai` or `none`. With `none` the app uses rule-based extraction and says so in the UI and report. |
| `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` | `hash` (default lexical baseline), `openai`, `gemini` |
| `CHUNK_SIZE`, `CHUNK_OVERLAP`, `RETRIEVAL_TOP_K`, `MAX_CONTEXT_CHARS` | retrieval limits |
| `SCORE_W_*` | completeness-score weights |
| `ALLOW_PRIVATE_URLS` | keep `false`; only for local testing |

## Honest operating modes

* **No LLM key (default):** claims come from a rule-based extractor (`method: heuristic`) guided by categories from an objective-matched template. It handles dates, amounts, numbers, URLs and keyword-led statements well; unusual phrasing will be missed. Every claim is labelled with the method that produced it.
* **With an LLM key:** category proposal, claim extraction and free-text contradiction comparison use the model. Output is validated with Pydantic, repaired once, and then the stage fails loudly. A model-produced quote that is not found verbatim in the source is dropped and counted.
* **Embeddings:** the default `hash` embedder captures lexical overlap, not meaning. The UI states this wherever retrieval is shown. Retrieval scores displayed are the actual computed BM25 / cosine / RRF values.

## Tests

```bash
cd backend && pytest -q                                   # SQLite
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost/dds_test pytest -q   # PostgreSQL + pgvector
cd frontend && npm test && npx tsc --noEmit && npm run build
```

Results from the build sandbox: backend 76 passed on SQLite and 76 passed on PostgreSQL 16 + pgvector 0.6; frontend 18 passed, typecheck clean, production build succeeded. The suite covers URL/SSRF validation, HTML and PDF extraction, claim schema and provenance, category selection, coverage, gaps, contradictions (including scope/cycle non-conflicts), freshness, verification, checklist, scoring, the LLM retry/repair path, hybrid retrieval, the REST API end to end, failure handling, and the demo workflow. The live stack (uvicorn on PostgreSQL, WebSocket progress, CORS) was also exercised with real network calls.

## Known limitations

* **Not verified here:** `docker compose up --build` (no Docker in the build sandbox), the GitHub Actions workflow, a real LLM provider (the Gemini/OpenAI adapters follow the public REST contracts but were exercised only through a fake adapter), Redis mirroring, Langfuse/OpenTelemetry export, and visual inspection in a real browser (none could be installed).
* **Not implemented:** Firecrawl, Playwright rendering for JavaScript-only pages (such pages fail with an explicit extraction error), cross-encoder reranking (the `reranker` hook exists, no model is shipped), OCR for scanned PDFs, user accounts. Docling is used only if installed; otherwise `pypdf`.
* Retrieval scoring runs in Python over one session's chunks. The pgvector column and HNSW/GIN indexes exist and were verified on PostgreSQL, but the app's queries do not use them yet; fine at session scale.
* PDF export is the browser's print dialog, not server-side rendering.
* DNS is resolved before fetching and again on every redirect; a determined DNS-rebinding attacker between the check and the connection is not fully prevented. Run the fetcher in a network-restricted environment for hostile deployments.
* The in-process event bus and rate limiter are single-instance; use Redis pub/sub and a gateway limiter when scaling out.
* The initial Alembic revision builds the schema from the models (`create_all`) plus the vector/full-text indexes.

## Future scope

Semantic embeddings by default, native pgvector / `ts_rank` retrieval, JS-rendered crawling, OCR, cross-encoder reranking, multi-user workspaces, and recurring re-checks that alert when a source changes.
