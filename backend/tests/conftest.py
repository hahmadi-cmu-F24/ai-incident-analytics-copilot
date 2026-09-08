"""
Shared pytest fixtures.

Strategy: tests never touch the real data file or the real OpenAI API.
  - store.py is redirected to a temp file via DATA_FILE env var (monkeypatching
    the module-level path isn't straightforward, so we use tmp_path + env).
  - The LLM is patched with unittest.mock so tests are fast and offline.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Set a dummy API key before importing the app so the lazy client doesn't
# complain even if someone accidentally calls _get_client() in a test.
os.environ.setdefault("OPENAI_API_KEY", "test-key")


# ---------------------------------------------------------------------------
# Minimal valid LLM response dict (matches LLMAnalysis schema)
# ---------------------------------------------------------------------------

VALID_LLM_RESPONSE = {
    "category": "Database",
    "severity": "High",
    "root_causes": ["Connection pool exhausted", "Slow queries blocking connections"],
    "steps": [
        "Check active connection count with SELECT count(*) FROM pg_stat_activity",
        "Identify long-running queries and terminate if necessary",
        "Increase max_connections or tune pool size in application config",
    ],
    "stakeholder_summary": (
        "The application's database is temporarily unavailable because too many "
        "simultaneous requests are competing for a limited number of connections. "
        "The team is investigating and will restore service shortly."
    ),
    "confidence_score": 0.85,
    "error_type": "ConnectionPoolExhausted",
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def data_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """
    Redirect the store to a fresh temp file for each test.
    We patch the module-level _DATA_FILE after import.
    """
    import app.store as store_module

    f = tmp_path / "incidents.json"
    f.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(store_module, "_DATA_FILE", f)
    return f


@pytest.fixture()
def client(data_file: Path) -> TestClient:
    """TestClient wired to a clean temp data file."""
    import main  # noqa: import triggers load_dotenv
    return TestClient(main.app)


@pytest.fixture()
def mock_llm(monkeypatch: pytest.MonkeyPatch):
    """
    Patch analyse_incident to return VALID_LLM_RESPONSE without calling OpenAI.
    Returns (LLMAnalysis, elapsed_seconds=0.42).
    """
    from app.models import LLMAnalysis

    analysis = LLMAnalysis.model_validate(VALID_LLM_RESPONSE)

    with patch("app.routes.analyse_incident", return_value=(analysis, 0.42)) as mock:
        yield mock
