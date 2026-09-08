"""
JSON file-based store for incidents.

Deliberately simple: one JSON array in a single file.
Swap this module for a SQLAlchemy/SQLite implementation on Day 4
without touching any route code — same interface, different backend.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional
from uuid import UUID

from app.models import Incident

# Resolve data file path from environment (default: data/incidents.json)
_DATA_FILE = Path(os.getenv("DATA_FILE", "data/incidents.json"))


def _ensure_file() -> None:
    """Create the data file and parent directories if they don't exist."""
    _DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not _DATA_FILE.exists():
        _DATA_FILE.write_text("[]", encoding="utf-8")


def _read_all() -> list[dict]:
    _ensure_file()
    raw = _DATA_FILE.read_text(encoding="utf-8").strip()
    return json.loads(raw) if raw else []


def _write_all(incidents: list[dict]) -> None:
    _ensure_file()
    _DATA_FILE.write_text(
        json.dumps(incidents, indent=2, default=str),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Public API (mirrors what a DB layer would expose)
# ---------------------------------------------------------------------------

def save_incident(incident: Incident) -> Incident:
    """Persist a new or updated incident (upsert by id)."""
    all_incidents = _read_all()
    record = json.loads(incident.model_dump_json())

    # Upsert: replace existing record with the same id, else append
    replaced = False
    for i, existing in enumerate(all_incidents):
        if existing.get("id") == record["id"]:
            all_incidents[i] = record
            replaced = True
            break
    if not replaced:
        all_incidents.append(record)

    _write_all(all_incidents)
    return incident


def get_incident(incident_id: UUID) -> Optional[Incident]:
    """Return a single incident by id, or None if not found."""
    target = str(incident_id)
    for record in _read_all():
        if record.get("id") == target:
            return Incident.model_validate(record)
    return None


def list_incidents(
    category: Optional[str] = None,
    severity: Optional[str] = None,
    resolution_status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[Incident]:
    """Return a filtered, paginated list of incidents (newest first)."""
    records = _read_all()

    # Apply filters
    if category:
        records = [r for r in records if r.get("category", "").lower() == category.lower()]
    if severity:
        records = [r for r in records if r.get("severity", "").lower() == severity.lower()]
    if resolution_status:
        records = [r for r in records if r.get("resolution_status", "").lower() == resolution_status.lower()]

    # Sort newest first by submitted_at string (ISO format sorts lexicographically)
    records.sort(key=lambda r: r.get("submitted_at", ""), reverse=True)

    return [Incident.model_validate(r) for r in records[skip : skip + limit]]


def count_incidents() -> int:
    return len(_read_all())
