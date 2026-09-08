"""
LLM integration for incident analysis.

Uses the OpenAI chat completions API with structured JSON output.
The model is instructed to return a single JSON object matching LLMAnalysis.

To use a local Ollama model instead, set:
    OPENAI_BASE_URL=http://localhost:11434/v1
    OPENAI_API_KEY=ollama          (any non-empty string)
    OPENAI_MODEL=llama3            (or whichever model you have pulled)
"""

from __future__ import annotations

import json
import os
import time

from openai import OpenAI
from pydantic import ValidationError

from app.models import LLMAnalysis

# ---------------------------------------------------------------------------
# Client (lazy — created on first call so the module imports without a key)
# ---------------------------------------------------------------------------

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY", ""),
            base_url=os.getenv("OPENAI_BASE_URL") or None,
        )
    return _client


def _get_model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are an expert site reliability engineer and incident response specialist.
Your job is to analyse error messages, application logs, and incident descriptions
and return a structured JSON analysis.

You MUST respond with ONLY a single valid JSON object — no markdown fences,
no explanatory text outside the JSON. The JSON must conform to this schema:

{
  "category": "<string: one of Database, Network, Auth, Storage, Application, Infrastructure, Security, Other>",
  "severity": "<string: one of Critical, High, Medium, Low>",
  "root_causes": ["<most likely cause>", "<second most likely>", ...],
  "steps": ["<first troubleshooting step>", "<second step>", ...],
  "stakeholder_summary": "<2-3 sentence plain-English explanation for a non-technical stakeholder>",
  "confidence_score": <float between 0.0 and 1.0>,
  "error_type": "<short canonical error type label, e.g. OOM, Timeout, 500 Internal Server Error, NullPointerException>"
}

Guidelines:
- root_causes: list 2–5 causes, most likely first.
- steps: list 3–7 actionable steps in priority order.
- confidence_score: reflect genuine uncertainty. Use < 0.6 when the input is
  ambiguous or incomplete, 0.6–0.8 for probable analysis, > 0.8 only when
  the evidence is clear.
- stakeholder_summary: assume the reader has no technical background.
  Explain the business impact and what is being done, not the technical details.
- Do NOT fabricate log lines or stack traces not present in the input.
"""

_USER_TEMPLATE = """\
Analyse the following incident input and return the JSON analysis:

--- INCIDENT INPUT ---
{raw_input}
--- END ---
"""

# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def analyse_incident(raw_input: str) -> tuple[LLMAnalysis, float]:
    """
    Call the LLM and return (LLMAnalysis, elapsed_seconds).

    Raises:
        ValueError  — if the model returns malformed JSON or a schema mismatch.
        openai.OpenAIError — on API / network failure (let the route handle it).
    """
    start = time.perf_counter()

    response = _get_client().chat.completions.create(
        model=_get_model(),
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _USER_TEMPLATE.format(raw_input=raw_input)},
        ],
        temperature=0.2,       # low temperature = more deterministic, consistent output
        max_tokens=1024,
        response_format={"type": "json_object"},   # GPT-4o / GPT-4o-mini enforce JSON mode
    )

    elapsed = time.perf_counter() - start

    content = response.choices[0].message.content or ""

    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned non-JSON content: {content[:200]}") from exc

    try:
        analysis = LLMAnalysis.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"LLM JSON did not match expected schema: {exc}") from exc

    return analysis, elapsed
