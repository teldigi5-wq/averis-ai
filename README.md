<div align="center">

# 🔎 Averis

### Evidence-first academic integrity and similarity analysis

![Next.js](https://img.shields.io/badge/Next.js-Web-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Python](https://img.shields.io/badge/Python-Similarity%20Engine-3776AB?style=for-the-badge&logo=python&logoColor=white)

**An open-source, zero-cost-first student SaaS foundation for document similarity evidence — without pretending an LLM can prove plagiarism or AI authorship.**

[Roadmap](docs/ROADMAP.md) · [Zero-cost SaaS design](docs/ZERO_COST_SAAS.md) · [CI](https://github.com/teldigi5-wq/averis-ai/actions)

</div>

---

## Product snapshot

Averis is inspired by the workflow of commercial similarity-checking platforms while keeping the core analysis transparent, evidence based and reviewable.

The current beta combines deterministic text matching, document ingestion and secure student SaaS foundations. AI is optional and advisory; the system keeps similarity evidence separate from claims of academic misconduct.

| Area | Current direction |
|---|---|
| **Document ingestion** | TXT, PDF and DOCX extraction |
| **Similarity evidence** | Word shingles, Jaccard similarity and sentence matching |
| **Student SaaS** | Supabase Auth/RLS, scan credits and private scan history |
| **Infrastructure** | PostgreSQL/pgvector, Redis and MinIO foundations |
| **AI strategy** | Local-first provider abstraction; optional cloud providers later |
| **Integrity boundary** | Similarity and AI-writing indicators are review aids, not automatic proof |

---

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

## Implemented

- FastAPI service with health endpoint
- TXT/PDF/DOCX upload parsing
- Evidence-first exact/near-exact similarity engine
- Word-shingle + Jaccard similarity
- Sentence matching with RapidFuzz
- Simple web dashboard/upload experience
- Docker-ready PostgreSQL/pgvector, Redis, and MinIO services
- Provider abstraction for local/open AI
- Automated backend tests and frontend build CI
- Zero-cost student SaaS foundation with Supabase Auth/RLS
- Server-enforced free beta scan credits and private scan history
- Original files are not persisted by the current beta scan flow

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

## Zero-cost student beta

Averis is being built so the pre-revenue beta can operate without a recurring paid dependency. The current SaaS foundation supports Supabase Auth, per-student RLS, five starting scan credits, server-side credit consumption, scan history, and student-controlled history deletion.

See [`docs/ZERO_COST_SAAS.md`](docs/ZERO_COST_SAAS.md) for setup and security boundaries.

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
