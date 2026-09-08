"""
AI Incident Analytics Copilot — FastAPI application entry point.
"""

from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()  # Load .env before any other imports that read env vars

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import router

app = FastAPI(
    title="AI Incident Analytics Copilot",
    description=(
        "Submit error messages, logs, or incident descriptions. "
        "Get LLM-powered classification, root-cause analysis, "
        "troubleshooting steps, and stakeholder summaries."
    ),
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# CORS — allow the React dev server (port 5173) and any localhost port
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # CRA / fallback
        "http://localhost:80",     # Docker nginx
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
app.include_router(router)


@app.get("/api/health", tags=["utility"])
def health() -> dict:
    """Health check for Docker and load balancer probes."""
    return {"status": "ok"}
