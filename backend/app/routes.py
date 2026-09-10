"""
FastAPI routes for incident management and analytics.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from openai import OpenAIError

from app import store
from app.analytics import compute_summary
from app.llm import analyse_incident
from app.models import (
    Incident,
    SubmitIncidentRequest,
    UpdateFeedbackRequest,
    UpdateReviewRequest,
    UpdateStatusRequest,
)

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# POST /api/incidents — submit and analyse
# ---------------------------------------------------------------------------

@router.post("/incidents", response_model=Incident, status_code=201)
def submit_incident(body: SubmitIncidentRequest) -> Incident:
    """
    Submit raw incident input → run LLM analysis → persist and return result.

    - Measures ai_triage_time_seconds automatically.
    - Accepts optional manual_triage_time_seconds from the client.
    """
    try:
        analysis, elapsed_seconds = analyse_incident(body.raw_input)
    except OpenAIError as exc:
        logger.exception("LLM provider error while analysing incident")
        raise HTTPException(status_code=502, detail="LLM analysis is currently unavailable.") from exc
    except ValueError as exc:
        logger.exception("Invalid LLM analysis response")
        raise HTTPException(status_code=502, detail="LLM analysis returned an invalid response.") from exc

    incident = Incident(
        raw_input=body.raw_input,
        # LLM analysis fields
        category=analysis.category,
        severity=analysis.severity,
        root_causes=analysis.root_causes,
        steps=analysis.steps,
        stakeholder_summary=analysis.stakeholder_summary,
        confidence_score=analysis.confidence_score,
        error_type=analysis.error_type,
        # Metric 2: AI triage time (wall-clock LLM call duration)
        ai_triage_time_seconds=round(elapsed_seconds, 3),
        # Metric 1: manual triage time (optional, user-supplied)
        manual_triage_time_seconds=body.manual_triage_time_seconds,
    )

    return store.save_incident(incident)


# ---------------------------------------------------------------------------
# GET /api/incidents — list with filtering and pagination
# ---------------------------------------------------------------------------

@router.get("/incidents", response_model=list[Incident])
def list_incidents(
    category: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    resolution_status: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Incident]:
    """Return a filtered, paginated list of incidents (newest first)."""
    return store.list_incidents(
        category=category,
        severity=severity,
        resolution_status=resolution_status,
        skip=skip,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# GET /api/incidents/{id} — fetch single incident
# ---------------------------------------------------------------------------

@router.get("/incidents/{incident_id}", response_model=Incident)
def get_incident(incident_id: UUID) -> Incident:
    incident = store.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


# ---------------------------------------------------------------------------
# PATCH /api/incidents/{id}/status
# ---------------------------------------------------------------------------

@router.patch("/incidents/{incident_id}/status", response_model=Incident)
def update_status(incident_id: UUID, body: UpdateStatusRequest) -> Incident:
    incident = store.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.resolution_status = body.resolution_status
    return store.save_incident(incident)


# ---------------------------------------------------------------------------
# PATCH /api/incidents/{id}/feedback  (Metric 6)
# ---------------------------------------------------------------------------

@router.patch("/incidents/{incident_id}/feedback", response_model=Incident)
def update_feedback(incident_id: UUID, body: UpdateFeedbackRequest) -> Incident:
    incident = store.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.recommendation_feedback = body.recommendation_feedback
    return store.save_incident(incident)


# ---------------------------------------------------------------------------
# PATCH /api/incidents/{id}/review  (Metrics 4, 5, 8 + manual triage time)
# ---------------------------------------------------------------------------

@router.patch("/incidents/{incident_id}/review", response_model=Incident)
def update_review(incident_id: UUID, body: UpdateReviewRequest) -> Incident:
    """
    Record human evaluation of LLM output.
    Sets classification_correct (metric 4), root_cause_correct (metric 5),
    is_misleading / misleading_notes (metric 8), and optionally
    manual_triage_time_seconds (metric 1).
    """
    incident = store.get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if body.classification_correct is not None:
        incident.classification_correct = body.classification_correct
    if body.root_cause_correct is not None:
        incident.root_cause_correct = body.root_cause_correct
    if body.is_misleading is not None:
        incident.is_misleading = body.is_misleading
    if body.misleading_notes is not None:
        incident.misleading_notes = body.misleading_notes
    if body.review_notes is not None:
        incident.review_notes = body.review_notes
    if body.manual_triage_time_seconds is not None:
        incident.manual_triage_time_seconds = body.manual_triage_time_seconds

    incident.manually_reviewed = True
    return store.save_incident(incident)


# ---------------------------------------------------------------------------
# GET /api/analytics/summary — all nine metrics in one call
# ---------------------------------------------------------------------------

@router.get("/analytics/summary")
def analytics_summary() -> dict:
    """
    Return aggregated metrics across all stored incidents.

    Metrics included:
      1. median_manual_triage_seconds
      2. median_ai_triage_seconds
      3. pct_time_reduction
      4. classification_accuracy_pct
      5. root_cause_accuracy_pct
      6. recommendation_acceptance_rate_pct
      7. avg_confidence_score
      8. misleading_rate_pct
      9. performance_by_severity, performance_by_category
    Plus: volume counts, date series, category/error-type breakdowns.
    """
    incidents = store.list_incidents(limit=10_000)
    return compute_summary(incidents)
