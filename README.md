# AI Incident Analytics Copilot

Submit an error message, log, or incident description → get LLM-powered classification, root-cause analysis, prioritised troubleshooting steps, and a plain-English stakeholder summary. All results are stored and surfaced in an analytics dashboard tracking nine operational metrics.

---

## Running the backend

### Prerequisites
- Python 3.11+
- An OpenAI API key **or** a locally running [Ollama](https://ollama.com) instance

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

### Using Ollama instead of OpenAI

```bash
ollama pull llama3.2

# In .env:
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=llama3.2
```

---

## Core workflow (Day 2)

### 1 — Submit an incident

```bash
curl -X POST http://localhost:8000/api/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "raw_input": "FATAL: connection to database timed out after 30s. Pool exhausted. Active connections: 100/100.",
    "manual_triage_time_seconds": 480
  }'
```

**Response (201)**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "submitted_at": "2024-06-01T12:00:00Z",
  "raw_input": "FATAL: connection to database timed out ...",
  "category": "Database",
  "severity": "High",
  "root_causes": [
    "Connection pool exhausted — max connections reached",
    "Slow or blocking queries preventing connection release"
  ],
  "steps": [
    "Check active connections: SELECT count(*) FROM pg_stat_activity",
    "Identify long-running queries and terminate if safe",
    "Increase pool size or reduce connection timeout in app config",
    "Review recent deployments for N+1 query regressions"
  ],
  "stakeholder_summary": "The application's database is temporarily unavailable because too many simultaneous requests are competing for a limited number of connections. The engineering team is investigating the root cause and will restore normal service shortly.",
  "confidence_score": 0.87,
  "error_type": "ConnectionPoolExhausted",
  "ai_triage_time_seconds": 1.243,
  "manual_triage_time_seconds": 480,
  "classification_correct": null,
  "root_cause_correct": null,
  "recommendation_feedback": "pending",
  "is_misleading": null,
  "resolution_status": "Open",
  "manually_reviewed": false
}
```

### 2 — Accept or reject the recommendation

```bash
curl -X PATCH http://localhost:8000/api/incidents/{id}/feedback \
  -H "Content-Type: application/json" \
  -d '{"recommendation_feedback": "accepted"}'
```

### 3 — Update resolution status

```bash
curl -X PATCH http://localhost:8000/api/incidents/{id}/status \
  -H "Content-Type: application/json" \
  -d '{"resolution_status": "Resolved"}'
```

### 4 — Submit a human evaluation (sets metrics 4, 5, 8)

```bash
curl -X PATCH http://localhost:8000/api/incidents/{id}/review \
  -H "Content-Type: application/json" \
  -d '{
    "classification_correct": true,
    "root_cause_correct": true,
    "is_misleading": false,
    "review_notes": "Root cause confirmed — pool size was 50, increased to 150.",
    "manual_triage_time_seconds": 480
  }'
```

### 5 — Get the analytics dashboard data

```bash
curl http://localhost:8000/api/analytics/summary
```

**Response**
```json
{
  "total_incidents": 12,
  "median_manual_triage_seconds": 480,
  "median_ai_triage_seconds": 1.8,
  "pct_time_reduction": 99.6,
  "classification_accuracy_pct": 91.7,
  "root_cause_accuracy_pct": 83.3,
  "recommendation_acceptance_rate_pct": 78.6,
  "avg_confidence_score": 0.812,
  "misleading_rate_pct": 8.3,
  "resolution_breakdown": {"open": 3, "in_progress": 2, "resolved": 7},
  "feedback_breakdown": {"accepted": 11, "rejected": 3, "pending": 4},
  "incidents_by_date": [{"date": "2024-06-01", "count": 4}, "..."],
  "incidents_by_category": [{"category": "Database", "count": 5}, "..."],
  "top_error_types": [{"error_type": "Timeout", "count": 4}, "..."],
  "performance_by_severity": [
    {"severity": "High", "count": 5, "avg_confidence_score": 0.84, "...": "..."}
  ],
  "performance_by_category": [
    {"category": "Database", "count": 5, "classification_accuracy_pct": 100.0, "...": "..."}
  ]
}
```

---

## Error handling

| Scenario | HTTP status | Detail |
|----------|-------------|--------|
| `raw_input` shorter than 10 chars | `422` | Pydantic validation error |
| Missing request body | `422` | Pydantic validation error |
| OpenAI API / network failure | `502` | `"LLM API error: ..."` |
| LLM returns unparseable output | `502` | `"Could not extract a valid JSON object..."` |
| LLM JSON doesn't match schema | `502` | `"LLM JSON did not match expected schema: ..."` |
| Unknown incident id | `404` | `"Incident not found"` |

The LLM response parser handles three output formats automatically:
1. Clean JSON (GPT-4o JSON mode)
2. Markdown-fenced JSON (` ```json ... ``` `)
3. First `{...}` block found in the response (last-resort fallback for Ollama)

---

## Running tests

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v
```

**26 tests — no OpenAI key required.** All tests mock the LLM and use a temp data file isolated per test. Coverage:
- Successful submission → all fields populated
- Input validation (too short, missing body)
- OpenAI API error → 502 with readable message
- Malformed LLM output → 502 with readable message
- Persistence (submitted incident appears in list + fetchable by id)
- Analytics: empty store, all 9 metric keys present, correct aggregation with known data
- Performance breakdown by severity and category (metric 9)

---

## Metrics tracked

| # | Metric | How it's measured |
|---|--------|-------------------|
| 1 | Median manual triage time | `manual_triage_time_seconds` (user-supplied on submit or review) |
| 2 | Median AI-assisted triage time | `ai_triage_time_seconds` (server-measured LLM duration) |
| 3 | % time reduction | `(manual − AI) / manual × 100` computed in analytics |
| 4 | Classification accuracy | `classification_correct` set during manual review |
| 5 | Root-cause accuracy | `root_cause_correct` set during manual review |
| 6 | Recommendation acceptance rate | `recommendation_feedback` (accepted / rejected / pending) |
| 7 | AI confidence | `confidence_score` (LLM self-assessed, 0–1) |
| 8 | False/misleading recommendations | `is_misleading` flag set during review |
| 9 | Performance by severity/type | All above metrics grouped by `severity` + `category` |

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/incidents` | Submit incident → LLM analysis → store |
| `GET` | `/api/incidents` | List incidents (filter: category, severity, resolution_status) |
| `GET` | `/api/incidents/{id}` | Fetch single incident |
| `PATCH` | `/api/incidents/{id}/status` | Update resolution status |
| `PATCH` | `/api/incidents/{id}/feedback` | Record accepted/rejected recommendation |
| `PATCH` | `/api/incidents/{id}/review` | Add human evaluation (metrics 4, 5, 8) |
| `GET` | `/api/analytics/summary` | All 9 metrics + dashboard data in one call |
| `GET` | `/api/health` | Health check |
| `GET` | `/docs` | Swagger UI |

---

## Project structure

```
backend/
  main.py              # FastAPI app entry point
  app/
    models.py          # Pydantic models + data model (all 9 metrics)
    routes.py          # API route handlers
    store.py           # JSON file store (swap for SQLite on Day 4)
    llm.py             # OpenAI integration + structured prompt + JSON fallback parser
    analytics.py       # Pure aggregation functions — compute_summary()
  tests/
    conftest.py        # Fixtures (mock LLM, temp data file, TestClient)
    test_submit_incident.py
    test_analytics.py
  data/
    incidents.json     # Auto-created on first request
  requirements.txt
  pytest.ini
  .env.example
```

---

*Day 3: React frontend (Submit + History screens). Day 4: Analytics dashboard + Docker. Day 5: Seed data + polish.*
