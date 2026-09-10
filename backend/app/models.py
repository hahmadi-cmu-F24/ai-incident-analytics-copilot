"""
Pydantic models for the AI Incident Analytics Copilot.

All nine portfolio metrics are captured here:
  1. Median manual triage time       → manual_triage_time_seconds
  2. Median AI-assisted triage time  → ai_triage_time_seconds
  3. % time reduction                → computed in analytics from 1 & 2
  4. Classification accuracy         → classification_correct
  5. Root-cause accuracy             → root_cause_correct
  6. Recommendation acceptance rate  → recommendation_feedback
  7. AI confidence                   → confidence_score
  8. False/misleading recommendations→ is_misleading
  9. Performance by severity/type    → group metrics 1-8 by severity + category
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class Severity(str, Enum):
    critical = "Critical"
    high = "High"
    medium = "Medium"
    low = "Low"


class ResolutionStatus(str, Enum):
    open = "Open"
    in_progress = "In Progress"
    resolved = "Resolved"


class RecommendationFeedback(str, Enum):
    accepted = "accepted"
    rejected = "rejected"
    pending = "pending"


# ---------------------------------------------------------------------------
# LLM output schema  (structured JSON returned by the model)
# ---------------------------------------------------------------------------

class LLMAnalysis(BaseModel):
    """The structured payload the LLM must return inside its JSON block."""
    category: str = Field(
        description="Incident category, e.g. 'Database', 'Network', 'Auth', 'Storage', 'Application'"
    )
    severity: Severity
    root_causes: list[str] = Field(
        description="Ordered list of the most likely root causes (most likely first)"
    )
    steps: list[str] = Field(
        description="Ordered list of prioritised troubleshooting steps"
    )
    stakeholder_summary: str = Field(
        description="Plain-English explanation for a non-technical stakeholder (2-3 sentences)"
    )
    confidence_score: float = Field(
        ge=0.0, le=1.0,
        description="Model self-assessed confidence in the analysis (0.0 – 1.0)"
    )
    error_type: str = Field(
        description="Short canonical error type label, e.g. 'OOM', 'Timeout', '500 Internal Server Error'"
    )


# ---------------------------------------------------------------------------
# Stored incident (written to / read from the JSON store)
# ---------------------------------------------------------------------------

class Incident(BaseModel):
    # Identity
    id: UUID = Field(default_factory=uuid4)
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Raw user input
    raw_input: str

    # LLM analysis
    category: str = ""
    severity: Severity = Severity.medium
    root_causes: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    stakeholder_summary: str = ""
    confidence_score: float = 0.0
    error_type: str = ""

    # ── Metric 1 & 2: triage timing ──────────────────────────────────────
    # manual_triage_time_seconds: supplied by the user/frontend when they
    # record how long they spent triaging this incident without AI help.
    manual_triage_started_at: Optional[datetime] = None
    manual_triage_ended_at: Optional[datetime] = None
    manual_triage_time_seconds: Optional[int] = Field(
        default=None,
        ge=0,
        description="Manual triage duration in seconds"
    )   # derived or supplied

    # ai_triage_time_seconds: measured server-side as the wall-clock duration
    # of the LLM call (set automatically on POST /incidents).
    ai_triage_time_seconds: Optional[float] = None

    # ── Metric 4 & 5: accuracy (set during manual review) ────────────────
    classification_correct: Optional[bool] = None   # None = not yet reviewed
    root_cause_correct: Optional[bool] = None       # None = not yet reviewed

    # ── Metric 6: recommendation feedback ────────────────────────────────
    recommendation_feedback: RecommendationFeedback = RecommendationFeedback.pending

    # ── Metric 8: false / misleading flag ────────────────────────────────
    is_misleading: Optional[bool] = None            # None = not yet reviewed
    misleading_notes: Optional[str] = None

    # ── Workflow state ────────────────────────────────────────────────────
    resolution_status: ResolutionStatus = ResolutionStatus.open
    manually_reviewed: bool = False
    review_notes: Optional[str] = None


# ---------------------------------------------------------------------------
# API request / response schemas
# ---------------------------------------------------------------------------

class SubmitIncidentRequest(BaseModel):
    """Body for POST /api/incidents"""
    raw_input: str = Field(
        min_length=10,
        description="Error message, application log, or incident description to analyse"
    )
    manual_triage_time_seconds: Optional[int] = Field(
        default=None,
        ge=0,
        description="Optional: how many seconds the user spent triaging this manually before using the AI"
    )


class UpdateStatusRequest(BaseModel):
    """Body for PATCH /api/incidents/{id}/status"""
    resolution_status: ResolutionStatus


class UpdateFeedbackRequest(BaseModel):
    """Body for PATCH /api/incidents/{id}/feedback"""
    recommendation_feedback: RecommendationFeedback


class UpdateReviewRequest(BaseModel):
    """Body for PATCH /api/incidents/{id}/review"""
    classification_correct: Optional[bool] = None
    root_cause_correct: Optional[bool] = None
    is_misleading: Optional[bool] = None
    misleading_notes: Optional[str] = None
    review_notes: Optional[str] = None
    manual_triage_time_seconds: Optional[int] = Field(default=None, ge=0)
