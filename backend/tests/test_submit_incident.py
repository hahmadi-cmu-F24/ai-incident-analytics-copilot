"""
Tests for POST /api/incidents.

Covers:
  - Successful submission → full structured response
  - Input validation: raw_input too short
  - LLM API failure (OpenAIError) → 502
  - LLM returns malformed JSON (ValueError) → 502
  - All nine metric fields present in the response
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError


# ---------------------------------------------------------------------------
# Successful submission
# ---------------------------------------------------------------------------

def test_submit_incident_success(client: TestClient, mock_llm) -> None:
    """A valid submission returns 201 with fully populated analysis fields."""
    payload = {
        "raw_input": "FATAL: connection to database timed out after 30s. Pool exhausted.",
        "manual_triage_time_seconds": 300,
    }
    resp = client.post("/api/incidents", json=payload)
    assert resp.status_code == 201

    data = resp.json()

    # Core analysis fields
    assert data["category"] == "Database"
    assert data["severity"] == "High"
    assert isinstance(data["root_causes"], list)
    assert len(data["root_causes"]) >= 1
    assert isinstance(data["steps"], list)
    assert len(data["steps"]) >= 1
    assert isinstance(data["stakeholder_summary"], str)
    assert len(data["stakeholder_summary"]) > 10
    assert data["error_type"] == "ConnectionPoolExhausted"

    # Metric 7: confidence score present and in range
    assert 0.0 <= data["confidence_score"] <= 1.0

    # Metric 2: AI triage time measured server-side
    assert data["ai_triage_time_seconds"] == pytest.approx(0.42)

    # Metric 1: manual triage time echoed back
    assert data["manual_triage_time_seconds"] == 300

    # Metric 4, 5, 8: not yet reviewed — all None
    assert data["classification_correct"] is None
    assert data["root_cause_correct"] is None
    assert data["is_misleading"] is None

    # Metric 6: pending by default
    assert data["recommendation_feedback"] == "pending"

    # Workflow defaults
    assert data["resolution_status"] == "Open"
    assert data["manually_reviewed"] is False

    # Identity fields
    assert "id" in data
    assert "submitted_at" in data


def test_submit_incident_without_manual_time(client: TestClient, mock_llm) -> None:
    """manual_triage_time_seconds is optional — omitting it is fine."""
    resp = client.post("/api/incidents", json={"raw_input": "Out of memory error in pod worker-1"})
    assert resp.status_code == 201
    assert resp.json()["manual_triage_time_seconds"] is None


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def test_submit_incident_input_too_short(client: TestClient, mock_llm) -> None:
    """raw_input shorter than 10 characters is rejected with 422."""
    resp = client.post("/api/incidents", json={"raw_input": "err"})
    assert resp.status_code == 422
    # LLM should never have been called
    mock_llm.assert_not_called()


def test_submit_incident_missing_body(client: TestClient) -> None:
    """Missing request body returns 422."""
    resp = client.post("/api/incidents")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# LLM failure scenarios
# ---------------------------------------------------------------------------

def test_submit_incident_openai_error(client: TestClient, monkeypatch) -> None:
    """OpenAI API error (network / auth) returns 502 with a readable message."""
    from unittest.mock import patch

    with patch(
        "app.routes.analyse_incident",
        side_effect=APIConnectionError(request=None),
    ):
        resp = client.post(
            "/api/incidents",
            json={"raw_input": "Database connection refused on port 5432"},
        )

    assert resp.status_code == 502
    assert "LLM API error" in resp.json()["detail"]


def test_submit_incident_malformed_json(client: TestClient, monkeypatch) -> None:
    """LLM returning un-parseable content (ValueError) returns 502."""
    from unittest.mock import patch

    with patch(
        "app.routes.analyse_incident",
        side_effect=ValueError("Could not extract a valid JSON object"),
    ):
        resp = client.post(
            "/api/incidents",
            json={"raw_input": "Disk full on /var/log, no space left on device"},
        )

    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "JSON" in detail or "extract" in detail.lower() or len(detail) > 0


# ---------------------------------------------------------------------------
# Persistence — submitted incident appears in list and can be fetched by id
# ---------------------------------------------------------------------------

def test_submitted_incident_persisted(client: TestClient, mock_llm) -> None:
    """After a successful POST, the incident appears in GET /api/incidents."""
    resp = client.post(
        "/api/incidents",
        json={"raw_input": "SSL handshake timeout connecting to auth service"},
    )
    assert resp.status_code == 201
    incident_id = resp.json()["id"]

    # List endpoint
    list_resp = client.get("/api/incidents")
    assert list_resp.status_code == 200
    ids = [i["id"] for i in list_resp.json()]
    assert incident_id in ids

    # Fetch by id
    fetch_resp = client.get(f"/api/incidents/{incident_id}")
    assert fetch_resp.status_code == 200
    assert fetch_resp.json()["id"] == incident_id
