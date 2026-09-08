"""
Tests for GET /api/analytics/summary.

Covers:
  - Empty store returns zeros / Nones (not an error)
  - All nine metric keys present in the response
  - Correct aggregation with known fixture data
  - performance_by_severity and performance_by_category groupings
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.analytics import compute_summary
from app.models import (
    Incident,
    RecommendationFeedback,
    ResolutionStatus,
    Severity,
)


# ---------------------------------------------------------------------------
# Unit tests for compute_summary (pure function — no HTTP)
# ---------------------------------------------------------------------------

def _make_incident(**kwargs) -> Incident:
    """Build a minimal Incident with sensible defaults, override via kwargs."""
    defaults = dict(
        raw_input="test input that is long enough",
        category="Database",
        severity=Severity.high,
        root_causes=["cause A"],
        steps=["step 1"],
        stakeholder_summary="Something broke.",
        confidence_score=0.8,
        error_type="Timeout",
        ai_triage_time_seconds=2.5,
        submitted_at=datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
    )
    defaults.update(kwargs)
    return Incident(**defaults)


class TestComputeSummaryEmpty:
    def test_empty_store_returns_zeros_not_error(self):
        result = compute_summary([])
        assert result["total_incidents"] == 0
        assert result["median_manual_triage_seconds"] is None
        assert result["median_ai_triage_seconds"] is None
        assert result["pct_time_reduction"] is None
        assert result["classification_accuracy_pct"] is None
        assert result["avg_confidence_score"] is None
        assert result["misleading_rate_pct"] is None
        assert result["performance_by_severity"] == []
        assert result["performance_by_category"] == []

    def test_empty_store_feedback_breakdown_is_zero(self):
        result = compute_summary([])
        fb = result["feedback_breakdown"]
        assert fb["accepted"] == 0
        assert fb["rejected"] == 0
        assert fb["pending"] == 0


class TestComputeSummaryMetrics:
    @pytest.fixture()
    def incidents(self) -> list[Incident]:
        """Four incidents with known values for deterministic assertions."""
        return [
            _make_incident(
                category="Database",
                severity=Severity.high,
                confidence_score=0.9,
                manual_triage_time_seconds=600,
                ai_triage_time_seconds=3.0,
                recommendation_feedback=RecommendationFeedback.accepted,
                classification_correct=True,
                root_cause_correct=True,
                is_misleading=False,
                resolution_status=ResolutionStatus.resolved,
                manually_reviewed=True,
                submitted_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
            ),
            _make_incident(
                category="Network",
                severity=Severity.medium,
                confidence_score=0.7,
                manual_triage_time_seconds=400,
                ai_triage_time_seconds=2.0,
                recommendation_feedback=RecommendationFeedback.accepted,
                classification_correct=True,
                root_cause_correct=False,
                is_misleading=False,
                resolution_status=ResolutionStatus.resolved,
                manually_reviewed=True,
                submitted_at=datetime(2024, 6, 2, tzinfo=timezone.utc),
            ),
            _make_incident(
                category="Database",
                severity=Severity.critical,
                confidence_score=0.6,
                manual_triage_time_seconds=None,
                ai_triage_time_seconds=4.0,
                recommendation_feedback=RecommendationFeedback.rejected,
                classification_correct=False,
                root_cause_correct=None,
                is_misleading=True,
                resolution_status=ResolutionStatus.open,
                manually_reviewed=True,
                submitted_at=datetime(2024, 6, 2, tzinfo=timezone.utc),
            ),
            _make_incident(
                category="Auth",
                severity=Severity.low,
                confidence_score=0.5,
                manual_triage_time_seconds=None,
                ai_triage_time_seconds=None,
                recommendation_feedback=RecommendationFeedback.pending,
                classification_correct=None,
                root_cause_correct=None,
                is_misleading=None,
                resolution_status=ResolutionStatus.in_progress,
                manually_reviewed=False,
                submitted_at=datetime(2024, 6, 3, tzinfo=timezone.utc),
            ),
        ]

    def test_total_count(self, incidents):
        assert compute_summary(incidents)["total_incidents"] == 4

    def test_metric_1_median_manual_triage(self, incidents):
        # Only 2 incidents have manual_triage_time_seconds: 600, 400 → median = 500
        result = compute_summary(incidents)
        assert result["median_manual_triage_seconds"] == 500.0

    def test_metric_2_median_ai_triage(self, incidents):
        # ai_triage_time_seconds: 3.0, 2.0, 4.0 → median = 3.0
        result = compute_summary(incidents)
        assert result["median_ai_triage_seconds"] == 3.0

    def test_metric_3_pct_time_reduction(self, incidents):
        # (500 - 3) / 500 * 100 = 99.4
        result = compute_summary(incidents)
        assert result["pct_time_reduction"] == pytest.approx(99.4, abs=0.1)

    def test_metric_4_classification_accuracy(self, incidents):
        # Reviewed: inc1(True), inc2(True), inc3(False) → 2/3 = 66.7%
        result = compute_summary(incidents)
        assert result["classification_accuracy_pct"] == pytest.approx(66.7, abs=0.1)
        assert result["classification_reviewed_count"] == 3

    def test_metric_5_root_cause_accuracy(self, incidents):
        # Reviewed: inc1(True), inc2(False) → 1/2 = 50.0%
        result = compute_summary(incidents)
        assert result["root_cause_accuracy_pct"] == pytest.approx(50.0, abs=0.1)
        assert result["root_cause_reviewed_count"] == 2

    def test_metric_6_acceptance_rate(self, incidents):
        # accepted=2, rejected=1, pending=1 → 2/(2+1) = 66.7%
        result = compute_summary(incidents)
        assert result["recommendation_acceptance_rate_pct"] == pytest.approx(66.7, abs=0.1)
        fb = result["feedback_breakdown"]
        assert fb["accepted"] == 2
        assert fb["rejected"] == 1
        assert fb["pending"] == 1

    def test_metric_7_avg_confidence(self, incidents):
        # 0.9, 0.7, 0.6, 0.5 → mean = 0.675
        result = compute_summary(incidents)
        assert result["avg_confidence_score"] == pytest.approx(0.675, abs=0.001)

    def test_metric_8_misleading_rate(self, incidents):
        # Reviewed: inc1(False), inc2(False), inc3(True) → 1/3 = 33.3%
        result = compute_summary(incidents)
        assert result["misleading_rate_pct"] == pytest.approx(33.3, abs=0.1)
        assert result["misleading_reviewed_count"] == 3

    def test_metric_9_performance_by_severity(self, incidents):
        result = compute_summary(incidents)
        groups = {g["severity"]: g for g in result["performance_by_severity"]}
        assert "High" in groups
        assert "Medium" in groups
        assert "Critical" in groups
        assert "Low" in groups
        # High group has 1 incident with 100% acceptance
        assert groups["High"]["recommendation_acceptance_rate_pct"] == 100.0

    def test_metric_9_performance_by_category(self, incidents):
        result = compute_summary(incidents)
        groups = {g["category"]: g for g in result["performance_by_category"]}
        # Database has 2 incidents (highest count → first)
        assert groups["Database"]["count"] == 2

    def test_resolution_breakdown(self, incidents):
        result = compute_summary(incidents)
        rb = result["resolution_breakdown"]
        assert rb["resolved"] == 2
        assert rb["open"] == 1
        assert rb["in_progress"] == 1

    def test_incidents_by_date(self, incidents):
        result = compute_summary(incidents)
        dates = {d["date"]: d["count"] for d in result["incidents_by_date"]}
        assert dates["2024-06-01"] == 1
        assert dates["2024-06-02"] == 2
        assert dates["2024-06-03"] == 1

    def test_manual_review_rate(self, incidents):
        result = compute_summary(incidents)
        # 3 out of 4 manually reviewed = 75%
        assert result["manual_review_rate_pct"] == pytest.approx(75.0, abs=0.1)


# ---------------------------------------------------------------------------
# HTTP integration test for GET /api/analytics/summary
# ---------------------------------------------------------------------------

class TestAnalyticsEndpoint:
    def test_empty_returns_200(self, client: TestClient) -> None:
        resp = client.get("/api/analytics/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_incidents"] == 0

    def test_all_nine_metric_keys_present(self, client: TestClient) -> None:
        resp = client.get("/api/analytics/summary")
        assert resp.status_code == 200
        data = resp.json()
        required_keys = [
            "median_manual_triage_seconds",   # metric 1
            "median_ai_triage_seconds",        # metric 2
            "pct_time_reduction",              # metric 3
            "classification_accuracy_pct",     # metric 4
            "root_cause_accuracy_pct",         # metric 5
            "recommendation_acceptance_rate_pct",  # metric 6
            "avg_confidence_score",            # metric 7
            "misleading_rate_pct",             # metric 8
            "performance_by_severity",         # metric 9
            "performance_by_category",         # metric 9
        ]
        for key in required_keys:
            assert key in data, f"Missing metric key: {key}"

    def test_after_submission_metrics_reflect_data(
        self, client: TestClient, mock_llm
    ) -> None:
        """Submit an incident, then check analytics reflects it."""
        client.post(
            "/api/incidents",
            json={
                "raw_input": "HTTP 500 from payment service on all checkout requests",
                "manual_triage_time_seconds": 480,
            },
        )
        resp = client.get("/api/analytics/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_incidents"] == 1
        # Metric 2: ai_triage_time_seconds was 0.42 (from mock fixture)
        assert data["median_ai_triage_seconds"] == pytest.approx(0.42, abs=0.01)
        # Metric 1: 480 seconds supplied
        assert data["median_manual_triage_seconds"] == 480.0
        # Metric 7: confidence_score from VALID_LLM_RESPONSE = 0.85
        assert data["avg_confidence_score"] == pytest.approx(0.85, abs=0.01)
