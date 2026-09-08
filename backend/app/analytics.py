"""
Analytics aggregation for the AI Incident Analytics Copilot.

Computes all nine portfolio metrics from the stored incidents.
Pure functions — no side effects, easy to test.
"""

from __future__ import annotations

import statistics
from collections import Counter
from typing import Optional

from app.models import Incident, RecommendationFeedback, ResolutionStatus


# ---------------------------------------------------------------------------
# Output schema (returned as plain dicts — FastAPI serialises to JSON)
# ---------------------------------------------------------------------------

def _median_opt(values: list[float]) -> Optional[float]:
    """Return median of a list, or None if the list is empty."""
    return round(statistics.median(values), 3) if values else None


def _pct(numerator: int, denominator: int) -> Optional[float]:
    """Return percentage rounded to 1 dp, or None if denominator is zero."""
    return round(numerator / denominator * 100, 1) if denominator else None


# ---------------------------------------------------------------------------
# Top-level summary
# ---------------------------------------------------------------------------

def compute_summary(incidents: list[Incident]) -> dict:
    """
    Compute the full analytics summary from a list of incidents.

    Metrics returned:
      1. median_manual_triage_seconds   — metric 1
      2. median_ai_triage_seconds       — metric 2
      3. pct_time_reduction             — metric 3
      4. classification_accuracy_pct    — metric 4 (reviewed incidents only)
      5. root_cause_accuracy_pct        — metric 5 (reviewed incidents only)
      6. recommendation_acceptance_rate — metric 6
      7. avg_confidence_score           — metric 7
      8. misleading_rate_pct            — metric 8 (reviewed incidents only)
      9. performance_by_severity        — metric 9
         performance_by_category        — metric 9 (second dimension)
    """
    total = len(incidents)

    # ── 1 & 2: triage timing ─────────────────────────────────────────────
    manual_times = [
        i.manual_triage_time_seconds
        for i in incidents
        if i.manual_triage_time_seconds is not None
    ]
    ai_times = [
        i.ai_triage_time_seconds
        for i in incidents
        if i.ai_triage_time_seconds is not None
    ]
    median_manual = _median_opt(manual_times)
    median_ai = _median_opt(ai_times)

    # ── 3: % time reduction ───────────────────────────────────────────────
    pct_reduction: Optional[float] = None
    if median_manual is not None and median_ai is not None and median_manual > 0:
        pct_reduction = round((median_manual - median_ai) / median_manual * 100, 1)

    # ── 4: classification accuracy ────────────────────────────────────────
    reviewed_classification = [
        i for i in incidents if i.classification_correct is not None
    ]
    classification_accuracy = _pct(
        sum(1 for i in reviewed_classification if i.classification_correct),
        len(reviewed_classification),
    )

    # ── 5: root-cause accuracy ────────────────────────────────────────────
    reviewed_root_cause = [
        i for i in incidents if i.root_cause_correct is not None
    ]
    root_cause_accuracy = _pct(
        sum(1 for i in reviewed_root_cause if i.root_cause_correct),
        len(reviewed_root_cause),
    )

    # ── 6: recommendation acceptance rate ────────────────────────────────
    feedback_counts = Counter(i.recommendation_feedback for i in incidents)
    accepted = feedback_counts.get(RecommendationFeedback.accepted, 0)
    rejected = feedback_counts.get(RecommendationFeedback.rejected, 0)
    pending = feedback_counts.get(RecommendationFeedback.pending, 0)
    reviewed_feedback = accepted + rejected
    acceptance_rate = _pct(accepted, reviewed_feedback)

    # ── 7: AI confidence ─────────────────────────────────────────────────
    confidence_scores = [i.confidence_score for i in incidents if i.confidence_score > 0]
    avg_confidence = round(statistics.mean(confidence_scores), 3) if confidence_scores else None

    # ── 8: misleading rate ────────────────────────────────────────────────
    reviewed_misleading = [i for i in incidents if i.is_misleading is not None]
    misleading_rate = _pct(
        sum(1 for i in reviewed_misleading if i.is_misleading),
        len(reviewed_misleading),
    )

    # ── Dashboard slices ──────────────────────────────────────────────────
    status_counts = Counter(i.resolution_status for i in incidents)
    category_counts = Counter(i.category for i in incidents if i.category)
    error_type_counts = Counter(i.error_type for i in incidents if i.error_type)
    manual_review_count = sum(1 for i in incidents if i.manually_reviewed)

    # Incidents by date (date string → count)
    date_counts: Counter[str] = Counter()
    for i in incidents:
        date_counts[i.submitted_at.date().isoformat()] += 1

    # ── 9: performance by severity & category ────────────────────────────
    performance_by_severity = _performance_breakdown(incidents, key="severity")
    performance_by_category = _performance_breakdown(incidents, key="category")

    return {
        # Volume
        "total_incidents": total,
        "manual_review_count": manual_review_count,
        "manual_review_rate_pct": _pct(manual_review_count, total),
        # Metric 1
        "median_manual_triage_seconds": median_manual,
        # Metric 2
        "median_ai_triage_seconds": median_ai,
        # Metric 3
        "pct_time_reduction": pct_reduction,
        # Metric 4
        "classification_accuracy_pct": classification_accuracy,
        "classification_reviewed_count": len(reviewed_classification),
        # Metric 5
        "root_cause_accuracy_pct": root_cause_accuracy,
        "root_cause_reviewed_count": len(reviewed_root_cause),
        # Metric 6
        "recommendation_acceptance_rate_pct": acceptance_rate,
        "feedback_breakdown": {
            "accepted": accepted,
            "rejected": rejected,
            "pending": pending,
        },
        # Metric 7
        "avg_confidence_score": avg_confidence,
        # Metric 8
        "misleading_rate_pct": misleading_rate,
        "misleading_reviewed_count": len(reviewed_misleading),
        # Resolution status breakdown
        "resolution_breakdown": {
            "open": status_counts.get(ResolutionStatus.open, 0),
            "in_progress": status_counts.get(ResolutionStatus.in_progress, 0),
            "resolved": status_counts.get(ResolutionStatus.resolved, 0),
        },
        # Dashboard chart data
        "incidents_by_date": [
            {"date": d, "count": c}
            for d, c in sorted(date_counts.items())
        ],
        "incidents_by_category": [
            {"category": cat, "count": cnt}
            for cat, cnt in category_counts.most_common()
        ],
        "top_error_types": [
            {"error_type": et, "count": cnt}
            for et, cnt in error_type_counts.most_common(10)
        ],
        # Metric 9
        "performance_by_severity": performance_by_severity,
        "performance_by_category": performance_by_category,
    }


def _performance_breakdown(incidents: list[Incident], key: str) -> list[dict]:
    """
    Group key metrics by a dimension (severity or category).
    Returns a list of dicts, one per distinct value, sorted by incident count desc.
    """
    groups: dict[str, list[Incident]] = {}
    for inc in incidents:
        raw = getattr(inc, key, "") or "Unknown"
        # Unwrap enum values (e.g. Severity.high → "High")
        dim = raw.value if hasattr(raw, "value") else str(raw)
        groups.setdefault(dim, []).append(inc)

    result = []
    for dim, group in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        manual_times = [
            i.manual_triage_time_seconds
            for i in group
            if i.manual_triage_time_seconds is not None
        ]
        ai_times = [
            i.ai_triage_time_seconds
            for i in group
            if i.ai_triage_time_seconds is not None
        ]
        classified = [i for i in group if i.classification_correct is not None]
        misleading = [i for i in group if i.is_misleading is not None]
        feedback_g = Counter(i.recommendation_feedback for i in group)
        accepted_g = feedback_g.get(RecommendationFeedback.accepted, 0)
        reviewed_g = accepted_g + feedback_g.get(RecommendationFeedback.rejected, 0)
        confidence_g = [i.confidence_score for i in group if i.confidence_score > 0]

        result.append({
            key: dim,
            "count": len(group),
            "median_manual_triage_seconds": _median_opt(manual_times),
            "median_ai_triage_seconds": _median_opt(ai_times),
            "classification_accuracy_pct": _pct(
                sum(1 for i in classified if i.classification_correct), len(classified)
            ),
            "recommendation_acceptance_rate_pct": _pct(accepted_g, reviewed_g),
            "avg_confidence_score": round(statistics.mean(confidence_g), 3) if confidence_g else None,
            "misleading_rate_pct": _pct(
                sum(1 for i in misleading if i.is_misleading), len(misleading)
            ),
        })
    return result
