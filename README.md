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

<img width="1341" height="704" alt="Screenshot 2026-09-10 at 5 10 12 PM" src="https://github.com/user-attachments/assets/bad9d5a7-99b7-40a6-88f3-bbcb6d0afe1c" />

### Submit Incident

<img width="1367" height="451" alt="Screenshot 2026-09-10 at 5 11 26 PM" src="https://github.com/user-attachments/assets/e5761318-09fb-49dc-a7a3-d79e2826e94a" />

### Incident Detail & Human Review

<img width="389" height="641" alt="Screenshot 2026-09-10 at 5 12 21 PM" src="https://github.com/user-attachments/assets/5a80c2fe-f4a0-4549-901a-c12b0979c516" />

### Incident History

<img width="883" height="280" alt="Screenshot 2026-09-10 at 5 12 42 PM" src="https://github.com/user-attachments/assets/4e7ecf83-248c-4552-8c7a-6a46a7a199f6" />

## Architecture

```text
                    ┌──────────────────────┐
                    │     React Frontend   │
                    │                      │
                    │ Dashboard            │
                    │ Submit Incident      │
                    │ Incident History     │
                    │ Human Review         │
                    └──────────┬───────────┘
                               │
                         REST API / JSON
                               │
                    ┌──────────▼───────────┐
                    │      FastAPI         │
                    │                      │
                    │ Incident API         │
                    │ Validation           │
                    │ Status / Feedback    │
                    │ Human Review         │
                    │ Analytics            │
                    └───────┬───────┬──────┘
                            │       │
                   ┌────────▼──┐ ┌──▼─────────────┐
                   │ LLM Layer │ │ JSON Data Store │
                   │           │ │                 │
                   │ OpenAI    │ │ Incidents       │
                   │ / Ollama  │ │                 │
                   └───────────┘ └─────────────────┘
