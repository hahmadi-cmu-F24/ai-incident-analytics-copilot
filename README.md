# AI Incident Analytics Copilot

AI-powered incident analysis and evaluation platform that transforms error
messages, logs, and incident descriptions into structured troubleshooting
recommendations.

Users can submit an incident and receive:

- Incident classification
- Severity assessment
- Likely root causes
- Prioritized troubleshooting steps
- Plain-English stakeholder summary
- AI confidence score

The application also provides a human-in-the-loop review workflow and an
analytics dashboard for evaluating AI recommendations across nine operational
metrics.

## Overview

Incident triage often requires engineers to interpret error messages,
identify potential root causes, determine appropriate troubleshooting steps,
and communicate the issue to other stakeholders.

This project explores how an LLM can assist that workflow while preserving
human evaluation and measurable feedback.

Rather than treating an AI response as automatically correct, the system
captures human feedback and review data to evaluate:

- Classification accuracy
- Root-cause accuracy
- Recommendation acceptance
- Misleading recommendations
- AI confidence
- Manual vs. AI-assisted triage time
- Performance across severity and incident categories

## Key Features

### AI Incident Analysis

Submit an error message, log snippet, or incident description and receive a
structured analysis containing:

- Category
- Severity
- Error type
- Likely root causes
- Recommended troubleshooting steps
- Stakeholder summary
- Confidence score

### Human-in-the-Loop Evaluation

Engineers can review AI-generated recommendations and record:

- Whether the classification was correct
- Whether the root cause was correct
- Whether the response was misleading
- Manual triage time
- Review notes

This allows the system to measure AI performance using human evaluation rather
than relying solely on model-generated confidence.

### Analytics Dashboard

The dashboard aggregates incident data into nine operational metrics:

| # | Metric | Description |
|---|---|---|
| 1 | Median manual triage time | Time manually spent analyzing incidents |
| 2 | Median AI-assisted triage time | Server-measured LLM analysis time |
| 3 | Time reduction | Difference between manual and AI-assisted triage |
| 4 | Classification accuracy | Human evaluation of AI classification |
| 5 | Root-cause accuracy | Human evaluation of predicted root causes |
| 6 | Recommendation acceptance rate | Percentage of recommendations accepted |
| 7 | AI confidence | LLM-reported confidence score |
| 8 | Misleading rate | Percentage of responses marked misleading |
| 9 | Performance by severity/category | Metrics grouped by incident characteristics |

The dashboard includes KPI cards, resolution and feedback charts,
incident-category breakdowns, error-type analysis, and performance by
severity.

### Incident History

Incidents can be searched and filtered by:

- Severity
- Resolution status
- Category

Each incident can be opened in a detail view containing the complete AI
analysis, original input, feedback, resolution status, and human review.

## Screenshots

### Analytics Dashboard

![Analytics Dashboard](docs/screenshots/dashboard.png)

### Submit Incident

![Analytics Dashboard](docs/screenshots/submit-incident.png)

### Incident Detail & Human Review

![Analytics Dashboard](docs/screenshots/incident-detail.png)

### Incident History

![Analytics Dashboard](docs/screenshots/incident-history.png)

## Architecture

```text
                         React Frontend
                              │
                              │ REST / JSON
                              ▼
                         FastAPI API
                         /          \
                        /            \
                       ▼              ▼
                  LLM Service     Analytics
                  OpenAI/Ollama   Aggregation
                       │              │
                       ▼              │
                  Structured          │
                    Result            │
                       │              │
                       └──────┬───────┘
                              ▼
                         JSON Storage
                              │
                              ▼
                     Human Review Data

## How It Works

1. **Submit an incident**  
   A user provides an error message, log snippet, or incident description.

2. **Validate the input**  
   FastAPI and Pydantic validate the request before analysis.

3. **Analyze with an LLM**  
   The backend sends the incident to the configured LLM and requests a
   structured analysis.

4. **Store the analysis**  
   The structured result is validated and persisted with the original
   incident.

5. **Review the recommendation**  
   Users can accept/reject the recommendation, update resolution status,
   and provide human evaluation.

6. **Measure performance**  
   Human feedback and timing data are aggregated into the analytics
   dashboard.

```text
Incident
   ↓
Validation
   ↓
LLM Analysis
   ↓
Structured Result
   ↓
Persistence
   ↓
Human Feedback / Review
   ↓
Analytics

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, TanStack Query |
| Backend | Python, FastAPI, Pydantic |
| AI | OpenAI API, Ollama |
| Data | JSON file persistence |
| Testing | Pytest |
| Development | Git, GitHub, IBM Bob |

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm
- OpenAI API key or Ollama

### Backend

```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

Add your LLM configuration to .env, then:

uvicorn main:app --reload --port 8000

The API will be available at:

http://localhost:8000

Interactive API documentation:

http://localhost:8000/docs

Frontend

In a second terminal:

cd frontend
npm install
npm run dev

The frontend will be available at:

http://localhost:5173

---

# 4. Add API Reference

This is especially valuable because your project is fundamentally an **API + frontend + AI system**.

```markdown
## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/incidents` | Analyze and store an incident |
| GET | `/api/incidents` | List incidents with filters |
| GET | `/api/incidents/{id}` | Retrieve an incident |
| PATCH | `/api/incidents/{id}/status` | Update resolution status |
| PATCH | `/api/incidents/{id}/feedback` | Accept/reject AI recommendation |
| PATCH | `/api/incidents/{id}/review` | Submit human evaluation |
| GET | `/api/analytics/summary` | Retrieve aggregated analytics |
| GET | `/api/health` | Health check |
| GET | `/docs` | Swagger API documentation |

## Testing

The backend currently has 48 automated tests covering:

- Incident submission
- Input validation
- Invalid triage times
- LLM/provider failures
- Malformed LLM responses
- Incident persistence
- Status updates
- Recommendation feedback
- Human review workflow
- Analytics aggregation
- Performance breakdowns

Run the tests with:

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v

The LLM is mocked during testing, so an OpenAI API key is not required.

## AI Evaluation Approach

The system separates model-generated confidence from human-validated
performance.

For each incident, a reviewer can independently evaluate:

- Classification correctness
- Root-cause correctness
- Whether recommendations were misleading
- Recommendation acceptance
- Manual triage time

This allows the dashboard to compare the model's reported confidence with
observed performance.

For example, a high-confidence AI response can still be marked incorrect by
a human reviewer. This helps avoid treating model confidence as ground-truth
accuracy.

## Limitations

This project is currently a local prototype designed to explore
AI-assisted incident triage and evaluation.

Current limitations include:

- JSON-based local persistence rather than a production database
- No authentication or authorization
- No concurrent multi-user data access controls
- LLM recommendations require human validation
- Analytics quality depends on the availability and quality of human review
- Frontend automated test coverage is not yet implemented

Potential production improvements include:

- Database-backed persistence
- Authentication and authorization
- Concurrent-safe storage
- Frontend automated testing
- Expanded evaluation datasets
- More rigorous model benchmarking
- Production deployment and observability

ai-incident-analytics-copilot/
├── backend/
│   ├── app/
│   │   ├── analytics.py
│   │   ├── llm.py
│   │   ├── models.py
│   │   ├── routes.py
│   │   └── store.py
│   ├── tests/
│   ├── data/
│   ├── main.py
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── SubmitIncident.jsx
│   │   │   ├── IncidentDetail.jsx
│   │   │   └── IncidentHistory.jsx
│   │   ├── api.js
│   │   └── App.jsx
│   └── package.json
│
└── README.md
