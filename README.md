# AI Incident Analytics Copilot

Submit an error message, log, or incident description → get LLM-powered classification, root-cause analysis, prioritised troubleshooting steps, and a plain-English stakeholder summary. All results are stored and surfaced in an analytics dashboard tracking nine operational metrics.

---

## Day 1 — Running the backend

### Prerequisites
- Python 3.11+
- An OpenAI API key (or a locally running [Ollama](https://ollama.com) instance)

### Setup

```bash
cd backend

# 1. Create virtualenv
python3 -m venv .venv && source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...

# 4. Start the server
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000/docs** for the interactive Swagger UI.

### Quick test (curl)

```bash
curl -X POST http://localhost:8000/api/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "FATAL: connection to database timed out after 30s. Pool exhausted. Active connections: 100/100.",
    "manual_triage_time_seconds": 480
  }'
```

### Using Ollama instead of OpenAI

```bash
# Pull a model
ollama pull llama3.2

# In .env:
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=llama3.2
```

---

## Metrics tracked

| # | Metric | How it's measured |
|---|--------|-------------------|
| 1 | Median manual triage time | `manual_triage_time_seconds` (user-supplied) |
| 2 | Median AI-assisted triage time | `ai_triage_time_seconds` (server-measured LLM duration) |
| 3 | % time reduction | `(manual − AI) / manual × 100` in analytics |
| 4 | Classification accuracy | `classification_correct` set during manual review |
| 5 | Root-cause accuracy | `root_cause_correct` set during manual review |
| 6 | Recommendation acceptance rate | `recommendation_feedback` (accepted / rejected / pending) |
| 7 | AI confidence | `confidence_score` (LLM self-assessed, 0–1) |
| 8 | False/misleading recommendations | `is_misleading` flag set during review |
| 9 | Performance by severity/type | All above metrics grouped by `severity` + `category` |

---

## Project structure

```
backend/
  main.py              # FastAPI app entry point
  app/
    models.py          # Pydantic models + data model (all 9 metrics)
    routes.py          # API route handlers
    store.py           # JSON file store (swap for SQLite on Day 4)
    llm.py             # OpenAI integration + structured prompt
  data/
    incidents.json     # Auto-created on first request
  requirements.txt
  .env.example
```

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/incidents` | Submit incident → LLM analysis → store |
| `GET` | `/api/incidents` | List incidents (filter by category, severity, status) |
| `GET` | `/api/incidents/{id}` | Fetch single incident |
| `PATCH` | `/api/incidents/{id}/status` | Update resolution status |
| `PATCH` | `/api/incidents/{id}/feedback` | Record accepted/rejected |
| `PATCH` | `/api/incidents/{id}/review` | Add manual evaluation (metrics 4, 5, 8) |
| `GET` | `/api/health` | Health check |
| `GET` | `/docs` | Swagger UI |

---

*Day 2: Full analytics endpoint. Day 3: React frontend. Day 4: Dashboard + Docker. Day 5: Seed data + polish.*
