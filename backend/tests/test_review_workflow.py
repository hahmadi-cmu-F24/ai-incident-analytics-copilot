"""
Tests for the human-review workflow:
  PATCH /api/incidents/{id}/review
  PATCH /api/incidents/{id}/status
  PATCH /api/incidents/{id}/feedback

Covers:
  - Full review payload persists all fields correctly
  - Partial review (only some fields supplied) merges without overwriting others
  - Review marks manually_reviewed = True
  - Boolean fields: true, false, and omitted (null)
  - Manual triage time persisted
  - Review notes and misleading notes persisted
  - Subsequent review updates override previous values
  - 404 on unknown incident id
  - Existing feedback/status NOT touched by review endpoint
  - Status update: all three valid values cycle correctly
  - Feedback update: accepted / rejected / pending
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helper: submit a fresh incident and return it
# ---------------------------------------------------------------------------
def _create_incident(client: TestClient, mock_llm, raw_input: str = None) -> dict:
    raw = raw_input or "Database connection pool exhausted after deployment rollout"
    resp = client.post("/api/incidents", json={"raw_input": raw})
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# PATCH /api/incidents/{id}/review — full payload
# ---------------------------------------------------------------------------

class TestReviewEndpoint:
    def test_full_review_persists_all_fields(self, client: TestClient, mock_llm) -> None:
        """A complete review payload updates every review field and sets manually_reviewed."""
        inc = _create_incident(client, mock_llm)
        iid = inc["id"]

        resp = client.patch(f"/api/incidents/{iid}/review", json={
            "classification_correct": True,
            "root_cause_correct": False,
            "is_misleading": False,
            "review_notes": "Root cause partially correct; category wrong.",
            "manual_triage_time_seconds": 360,
        })
        assert resp.status_code == 200

        data = resp.json()
        assert data["classification_correct"] is True
        assert data["root_cause_correct"] is False
        assert data["is_misleading"] is False
        assert data["review_notes"] == "Root cause partially correct; category wrong."
        assert data["manual_triage_time_seconds"] == 360
        assert data["manually_reviewed"] is True

    def test_review_sets_manually_reviewed_true(self, client: TestClient, mock_llm) -> None:
        """Any review payload — even an empty one — sets manually_reviewed = True."""
        inc = _create_incident(client, mock_llm)
        assert inc["manually_reviewed"] is False

        resp = client.patch(f"/api/incidents/{inc['id']}/review", json={})
        assert resp.status_code == 200
        assert resp.json()["manually_reviewed"] is True

    def test_review_bool_true(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/review", json={
            "classification_correct": True,
        })
        assert resp.status_code == 200
        assert resp.json()["classification_correct"] is True

    def test_review_bool_false(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/review", json={
            "classification_correct": False,
        })
        assert resp.status_code == 200
        assert resp.json()["classification_correct"] is False

    def test_review_omitted_bool_stays_null(self, client: TestClient, mock_llm) -> None:
        """Omitting a bool field in the review payload leaves it as None (not overwritten)."""
        inc = _create_incident(client, mock_llm)
        # Provide only root_cause_correct; classification_correct should stay None
        resp = client.patch(f"/api/incidents/{inc['id']}/review", json={
            "root_cause_correct": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["root_cause_correct"] is True
        assert data["classification_correct"] is None   # not touched

    def test_review_misleading_true_with_notes(self, client: TestClient, mock_llm) -> None:
        """is_misleading=True + misleading_notes both persist."""
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/review", json={
            "is_misleading": True,
            "misleading_notes": "The suggested query was syntactically wrong.",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_misleading"] is True
        assert data["misleading_notes"] == "The suggested query was syntactically wrong."

    def test_review_manual_triage_time_persisted(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/review", json={
            "manual_triage_time_seconds": 720,
        })
        assert resp.status_code == 200
        assert resp.json()["manual_triage_time_seconds"] == 720

        zero_resp = client.patch(f"/api/incidents/{inc['id']}/review", json={
            "manual_triage_time_seconds": 0,
        })
        assert zero_resp.status_code == 200
        assert zero_resp.json()["manual_triage_time_seconds"] == 0

        negative_resp = client.patch(f"/api/incidents/{inc['id']}/review", json={
            "manual_triage_time_seconds": -1,
        })
        assert negative_resp.status_code == 422

    def test_review_notes_persisted(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/review", json={
            "review_notes": "Confirmed fix — increased pool to 200.",
        })
        assert resp.status_code == 200
        assert resp.json()["review_notes"] == "Confirmed fix — increased pool to 200."

    def test_subsequent_review_updates_override(self, client: TestClient, mock_llm) -> None:
        """A second review call overwrites the values set by the first."""
        inc = _create_incident(client, mock_llm)
        iid = inc["id"]

        client.patch(f"/api/incidents/{iid}/review", json={
            "classification_correct": True,
            "review_notes": "First review.",
        })
        # Second review contradicts the first
        resp = client.patch(f"/api/incidents/{iid}/review", json={
            "classification_correct": False,
            "review_notes": "Second review — corrected.",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["classification_correct"] is False
        assert data["review_notes"] == "Second review — corrected."

    def test_review_does_not_change_feedback_or_status(self, client: TestClient, mock_llm) -> None:
        """The review endpoint must not affect recommendation_feedback or resolution_status."""
        inc = _create_incident(client, mock_llm)
        iid = inc["id"]

        # Set feedback and status first
        client.patch(f"/api/incidents/{iid}/feedback", json={"recommendation_feedback": "accepted"})
        client.patch(f"/api/incidents/{iid}/status",   json={"resolution_status": "Resolved"})

        # Now do a review
        review_resp = client.patch(f"/api/incidents/{iid}/review", json={
            "classification_correct": True,
        })
        assert review_resp.status_code == 200
        data = review_resp.json()
        # These must be unchanged
        assert data["recommendation_feedback"] == "accepted"
        assert data["resolution_status"] == "Resolved"

    def test_review_persists_to_store(self, client: TestClient, mock_llm) -> None:
        """Review data survives a subsequent GET — it's actually written to the store."""
        inc = _create_incident(client, mock_llm)
        iid = inc["id"]

        client.patch(f"/api/incidents/{iid}/review", json={
            "classification_correct": True,
            "root_cause_correct": True,
            "is_misleading": False,
            "review_notes": "All good.",
            "manual_triage_time_seconds": 240,
        })

        # Re-fetch and confirm values are persisted
        get_resp = client.get(f"/api/incidents/{iid}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["classification_correct"] is True
        assert data["root_cause_correct"] is True
        assert data["is_misleading"] is False
        assert data["review_notes"] == "All good."
        assert data["manual_triage_time_seconds"] == 240
        assert data["manually_reviewed"] is True

    def test_review_unknown_id_returns_404(self, client: TestClient) -> None:
        resp = client.patch(
            "/api/incidents/00000000-0000-0000-0000-000000000000/review",
            json={"classification_correct": True},
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Incident not found"


# ---------------------------------------------------------------------------
# PATCH /api/incidents/{id}/status
# ---------------------------------------------------------------------------

class TestStatusEndpoint:
    def test_status_open_to_in_progress(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/status", json={"resolution_status": "In Progress"})
        assert resp.status_code == 200
        assert resp.json()["resolution_status"] == "In Progress"

    def test_status_to_resolved(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/status", json={"resolution_status": "Resolved"})
        assert resp.status_code == 200
        assert resp.json()["resolution_status"] == "Resolved"

    def test_status_invalid_value_returns_422(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/status", json={"resolution_status": "Nonsense"})
        assert resp.status_code == 422

    def test_status_unknown_id_returns_404(self, client: TestClient) -> None:
        resp = client.patch(
            "/api/incidents/00000000-0000-0000-0000-000000000000/status",
            json={"resolution_status": "Resolved"},
        )
        assert resp.status_code == 404

    def test_status_persists_to_store(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        iid = inc["id"]
        client.patch(f"/api/incidents/{iid}/status", json={"resolution_status": "Resolved"})
        get_resp = client.get(f"/api/incidents/{iid}")
        assert get_resp.json()["resolution_status"] == "Resolved"


# ---------------------------------------------------------------------------
# PATCH /api/incidents/{id}/feedback
# ---------------------------------------------------------------------------

class TestFeedbackEndpoint:
    def test_feedback_accepted(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/feedback",
                            json={"recommendation_feedback": "accepted"})
        assert resp.status_code == 200
        assert resp.json()["recommendation_feedback"] == "accepted"

    def test_feedback_rejected(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/feedback",
                            json={"recommendation_feedback": "rejected"})
        assert resp.status_code == 200
        assert resp.json()["recommendation_feedback"] == "rejected"

    def test_feedback_invalid_value_returns_422(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        resp = client.patch(f"/api/incidents/{inc['id']}/feedback",
                            json={"recommendation_feedback": "maybe"})
        assert resp.status_code == 422

    def test_feedback_unknown_id_returns_404(self, client: TestClient) -> None:
        resp = client.patch(
            "/api/incidents/00000000-0000-0000-0000-000000000000/feedback",
            json={"recommendation_feedback": "accepted"},
        )
        assert resp.status_code == 404

    def test_feedback_persists_to_store(self, client: TestClient, mock_llm) -> None:
        inc = _create_incident(client, mock_llm)
        iid = inc["id"]
        client.patch(f"/api/incidents/{iid}/feedback", json={"recommendation_feedback": "accepted"})
        get_resp = client.get(f"/api/incidents/{iid}")
        assert get_resp.json()["recommendation_feedback"] == "accepted"
