/**
 * Shared utility components used across the app.
 * Kept here to avoid repetition without over-abstracting.
 */

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------
export function SeverityBadge({ severity }) {
  if (!severity) return null
  const key = severity.toLowerCase()
  return <span className={`badge badge-${key}`}>{severity}</span>
}

// ---------------------------------------------------------------------------
// Resolution status badge
// ---------------------------------------------------------------------------
export function StatusBadge({ status }) {
  if (!status) return null
  const key = status.toLowerCase().replace(' ', '_')
  return <span className={`badge badge-${key}`}>{status}</span>
}

// ---------------------------------------------------------------------------
// Feedback badge
// ---------------------------------------------------------------------------
export function FeedbackBadge({ feedback }) {
  if (!feedback) return null
  return <span className={`badge badge-${feedback}`}>{feedback}</span>
}

// ---------------------------------------------------------------------------
// Confidence bar
// ---------------------------------------------------------------------------
export function ConfidenceBar({ score }) {
  const pct = Math.round((score ?? 0) * 100)
  return (
    <div className="confidence-bar-wrap">
      <div className="confidence-track">
        <div className="confidence-fill" style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading spinner row
// ---------------------------------------------------------------------------
export function LoadingRow({ message = 'Loading…' }) {
  return (
    <div className="loading-row" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error alert
// ---------------------------------------------------------------------------
export function ErrorAlert({ message }) {
  if (!message) return null
  return (
    <div className="alert alert-error" role="alert">
      <strong>Error:</strong> {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({ icon = '📋', message }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <p>{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Format date string to local readable
// ---------------------------------------------------------------------------
export function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Format seconds into human-readable duration
// ---------------------------------------------------------------------------
export function formatDuration(seconds) {
  if (seconds == null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}
