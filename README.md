# Averis

Averis is an open-source, evidence-first academic integrity platform inspired by the workflow of commercial similarity-checking systems, without pretending an LLM can prove plagiarism or AI authorship.

## Project goals

- Exact and near-exact text similarity detection
- Semantic/paraphrase similarity (planned with BGE-M3 + pgvector)
- Source-level evidence and highlighted matching passages
- PDF/DOCX/TXT ingestion
- Citation and DOI verification (planned with Crossref/OpenAlex)
- Student-to-student and self-similarity checks
- Authorship-consistency indicators (advisory, not proof)
- Code similarity analysis (planned)
- Local-first AI with Ollama; optional cloud providers later
- Lecturer/admin workflows and downloadable reports

> Important: similarity evidence and AI-writing indicators are review aids. They are not automatic proof of academic misconduct.

## Repository layout

```text
averis-ai/
├── apps/web/                  # Next.js web application
├── services/api/              # FastAPI API and analysis services
├── docs/                      # Architecture and roadmap
├── .github/workflows/         # CI
├── docker-compose.yml         # Local infrastructure
└── .env.example
```

## Milestone 1 implemented

- FastAPI service with health endpoint
- TXT/PDF/DOCX upload parsing
- Evidence-first exact/near-exact similarity engine
- Word-shingle + Jaccard similarity
- Sentence matching with RapidFuzz
- Simple web dashboard/upload experience
- Docker-ready PostgreSQL/pgvector, Redis, and MinIO services
- Provider abstraction for local/open AI
- Automated backend tests and frontend build CI

## Quick start

### 1. API

```bash
cd services/api
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

### 2. Web

```bash
cd apps/web
npm install
npm run dev
```

Web app: `http://localhost:3000`

### 3. Optional local infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL + pgvector, Redis and MinIO for later milestones.

## API examples

### Analyze two blocks of text

`POST /api/v1/similarity/compare`

```json
{
  "document_text": "Machine learning improves intrusion detection systems.",
  "source_text": "Intrusion detection systems can be improved with machine learning.",
  "source_name": "reference-paper.txt"
}
```

### Upload a document

`POST /api/v1/documents/extract` as multipart form-data using the `file` field.

Supported in Milestone 1: `.txt`, `.pdf`, `.docx`.

## Free-first AI strategy

The AI subsystem is intentionally optional. Similarity scoring must remain deterministic and evidence based.

Default provider:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
```

Planned fallbacks include OpenRouter/Groq-compatible providers, but core similarity checking does not require them.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## License

MIT
