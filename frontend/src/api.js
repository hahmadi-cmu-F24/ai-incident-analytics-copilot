/**
 * api.js — single source of truth for all backend calls.
 *
 * All paths are relative (/api/...) so the Vite proxy handles routing
 * in development. No API keys or secrets ever appear here.
 *
 * Error contract: every function throws an Error with a human-readable
 * message on non-2xx responses so callers can show it directly in the UI.
 */

const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
    } catch {
      // response wasn't JSON
    }
    throw new Error(detail)
  }
  // 204 No Content has no body
  if (res.status === 204) return null
  return res.json()
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

/**
 * Submit a new incident for LLM analysis.
 * @param {string} rawInput
 * @param {number|null} manualTriageTimeSeconds
 * @returns {Promise<Incident>}
 */
export function submitIncident(rawInput, manualTriageTimeSeconds = null) {
  const body = { raw_input: rawInput }
  if (manualTriageTimeSeconds != null) {
    body.manual_triage_time_seconds = manualTriageTimeSeconds
  }
  return request('/incidents', { method: 'POST', body: JSON.stringify(body) })
}

/**
 * List incidents with optional filters and pagination.
 * @param {{ category?, severity?, resolution_status?, skip?, limit? }} params
 * @returns {Promise<Incident[]>}
 */
export function listIncidents(params = {}) {
  const qs = new URLSearchParams()
  if (params.category) qs.set('category', params.category)
  if (params.severity) qs.set('severity', params.severity)
  if (params.resolution_status) qs.set('resolution_status', params.resolution_status)
  if (params.skip != null) qs.set('skip', params.skip)
  if (params.limit != null) qs.set('limit', params.limit)
  const query = qs.toString() ? `?${qs}` : ''
  return request(`/incidents${query}`)
}

/**
 * Fetch a single incident by id.
 * @param {string} id
 * @returns {Promise<Incident>}
 */
export function getIncident(id) {
  return request(`/incidents/${id}`)
}

/**
 * Update the resolution status of an incident.
 * @param {string} id
 * @param {"Open"|"In Progress"|"Resolved"} status
 * @returns {Promise<Incident>}
 */
export function updateStatus(id, status) {
  return request(`/incidents/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ resolution_status: status }),
  })
}

/**
 * Record whether the user accepted or rejected the AI recommendation.
 * @param {string} id
 * @param {"accepted"|"rejected"|"pending"} feedback
 * @returns {Promise<Incident>}
 */
export function updateFeedback(id, feedback) {
  return request(`/incidents/${id}/feedback`, {
    method: 'PATCH',
    body: JSON.stringify({ recommendation_feedback: feedback }),
  })
}

/**
 * Submit a human review evaluation.
 * All fields are optional — only supplied fields are updated.
 * @param {string} id
 * @param {{ classification_correct?, root_cause_correct?, is_misleading?,
 *           misleading_notes?, review_notes?, manual_triage_time_seconds? }} review
 * @returns {Promise<Incident>}
 */
export function submitReview(id, review) {
  return request(`/incidents/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(review),
  })
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * Fetch the full analytics summary (all 9 metrics + dashboard data).
 * @returns {Promise<AnalyticsSummary>}
 */
export function getAnalyticsSummary() {
  return request('/analytics/summary')
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function checkHealth() {
  return request('/health')
}
