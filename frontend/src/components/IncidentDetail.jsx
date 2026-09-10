import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getIncident, updateStatus, updateFeedback, submitReview } from '../api'
import {
  SeverityBadge, StatusBadge, FeedbackBadge,
  ConfidenceBar, LoadingRow, ErrorAlert, formatDate, formatDuration
} from './shared'

// ---------------------------------------------------------------------------
// Helper: convert a stored boolean|null into the string value used by <select>
// ---------------------------------------------------------------------------
function boolToSelect(value) {
  if (value === true)  return 'true'
  if (value === false) return 'false'
  return ''
}

// ---------------------------------------------------------------------------
// Helper: build the initial form state from an incident object
// ---------------------------------------------------------------------------
function initialFormState(incident) {
  return {
    classification_correct:      boolToSelect(incident.classification_correct),
    root_cause_correct:          boolToSelect(incident.root_cause_correct),
    is_misleading:               boolToSelect(incident.is_misleading),
    misleading_notes:            incident.misleading_notes        || '',
    review_notes:                incident.review_notes            || '',
    manual_triage_time_seconds:  incident.manual_triage_time_seconds != null
                                   ? String(incident.manual_triage_time_seconds)
                                   : '',
  }
}

// ---------------------------------------------------------------------------
// Review form — calls PATCH /api/incidents/{id}/review
//
// Key fix: the parent passes `reviewKey` (changes whenever saved data arrives)
// so React remounts this component with fresh useState, eliminating the stale
// closure problem where selecting new values appeared not to persist.
// ---------------------------------------------------------------------------
function ReviewForm({ incident, onSaved }) {
  const queryClient = useQueryClient()

  // Initialise from current incident values.
  // Because the parent gives us a new `key` when saved data arrives, this
  // useState will always start from the correct (up-to-date) incident prop.
  const [form, setForm] = useState(() => initialFormState(incident))

  // Belt-and-suspenders: if somehow the same instance receives a new incident
  // prop (e.g. fast refreshes), sync the form without waiting for a remount.
  useEffect(() => {
    setForm(initialFormState(incident))
  }, [incident.id, incident.manually_reviewed,
      incident.classification_correct, incident.root_cause_correct,
      incident.is_misleading, incident.misleading_notes,
      incident.review_notes, incident.manual_triage_time_seconds])

  const setField = (fieldName, value) =>
    setForm(prev => ({ ...prev, [fieldName]: value }))

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {}

      // Only include boolean fields when the user has made a selection.
      if (form.classification_correct !== '')
        payload.classification_correct = form.classification_correct === 'true'
      if (form.root_cause_correct !== '')
        payload.root_cause_correct = form.root_cause_correct === 'true'
      if (form.is_misleading !== '')
        payload.is_misleading = form.is_misleading === 'true'

      // Free-text / numeric fields: always include if non-empty.
      if (form.misleading_notes.trim())
        payload.misleading_notes = form.misleading_notes.trim()
      if (form.review_notes.trim())
        payload.review_notes = form.review_notes.trim()
      if (form.manual_triage_time_seconds !== '') {
        const parsed = parseInt(form.manual_triage_time_seconds, 10)
        if (!isNaN(parsed) && parsed >= 0)
          payload.manual_triage_time_seconds = parsed
      }

      return submitReview(incident.id, payload)
    },
    onSuccess: (updated) => {
      // Keep the active query and form aligned with the API response.
      queryClient.setQueryData(['incident', updated.id], updated)
      setForm(initialFormState(updated))
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      // Propagate updated incident to parent — parent will change the key,
      // which remounts this component with refreshed initial state.
      onSaved(updated)
    },
  })

  // Explicit fieldName parameter avoids the fragile id.replace() approach.
  const BoolSelect = ({ fieldName, label }) => (
    <div className="form-group">
      <label className="form-label" htmlFor={`review-${fieldName}`}>{label}</label>
      <select
        id={`review-${fieldName}`}
        className="form-control"
        style={{ maxWidth: 220 }}
        value={form[fieldName]}
        onChange={e => setField(fieldName, e.target.value)}
      >
        <option value="">— not yet evaluated —</option>
        <option value="true">✓ Yes / Correct</option>
        <option value="false">✕ No / Incorrect</option>
      </select>
    </div>
  )

  return (
    <form onSubmit={e => { e.preventDefault(); mutation.mutate() }}>

      <BoolSelect fieldName="classification_correct" label="Classification correct?" />
      <BoolSelect fieldName="root_cause_correct"     label="Root cause correct?" />
      <BoolSelect fieldName="is_misleading"          label="Was the response misleading or false?" />

      {/* Misleading notes — only shown when marked misleading */}
      {form.is_misleading === 'true' && (
        <div className="form-group">
          <label className="form-label" htmlFor="review-misleading_notes">
            Describe what was misleading
          </label>
          <textarea
            id="review-misleading_notes"
            className="form-control"
            rows={2}
            value={form.misleading_notes}
            onChange={e => setField('misleading_notes', e.target.value)}
          />
        </div>
      )}

      {/* Manual triage time */}
      <div className="form-group">
        <label className="form-label" htmlFor="review-manual_triage_time_seconds">
          Manual triage time (seconds)
        </label>
        <input
          id="review-manual_triage_time_seconds"
          type="number"
          min={0}
          className="form-control"
          style={{ maxWidth: 200 }}
          placeholder="e.g. 480"
          value={form.manual_triage_time_seconds}
          onChange={e => setField('manual_triage_time_seconds', e.target.value)}
        />
        <div className="form-hint">Used for metric 1 (median manual triage time)</div>
      </div>

      {/* Review notes */}
      <div className="form-group">
        <label className="form-label" htmlFor="review-review_notes">Review notes</label>
        <textarea
          id="review-review_notes"
          className="form-control"
          rows={2}
          placeholder="Optional free-text notes about this incident…"
          value={form.review_notes}
          onChange={e => setField('review_notes', e.target.value)}
        />
      </div>

      {/* Error */}
      {mutation.isError && <ErrorAlert message={mutation.error.message} />}

      {/* Actions */}
      <div className="flex-row">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : 'Save Review'}
        </button>

        {mutation.isSuccess && (
          <span
            className="text-sm"
            style={{ color: 'var(--feedback-accepted)' }}
            role="status"
            aria-live="polite"
          >
            ✓ Review saved
          </span>
        )}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Incident detail modal
// ---------------------------------------------------------------------------
export default function IncidentDetail({ incidentId, onClose }) {
  const queryClient = useQueryClient()

  // Local copy of the incident — updated optimistically by each mutation
  // so the UI reflects changes immediately without waiting for a re-fetch.
  const [incident, setIncident] = useState(null)

  // reviewKey changes whenever a review is saved, which remounts ReviewForm
  // with fresh useState initialised from the latest incident data.
  const [reviewKey, setReviewKey] = useState(0)

  const { data, isLoading, error } = useQuery({
    queryKey: ['incident', incidentId],
    queryFn:  () => getIncident(incidentId),
  })

  // Sync local copy when the query delivers (or re-delivers) data.
  useEffect(() => { if (data) setIncident(data) }, [data])

  const statusMutation = useMutation({
    mutationFn: (status) => updateStatus(incidentId, status),
    onSuccess: (updated) => {
      setIncident(updated)
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
  })

  const feedbackMutation = useMutation({
    mutationFn: (fb) => updateFeedback(incidentId, fb),
    onSuccess: (updated) => {
      setIncident(updated)
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
  })

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleReviewSaved = (updated) => {
    queryClient.setQueryData(['incident', incidentId], updated)
    setIncident(updated)
    // Increment reviewKey → React remounts ReviewForm with fresh useState
    // so the dropdowns immediately show the just-saved values.
    setReviewKey(k => k + 1)
  }

  const inc = incident

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Incident detail"
    >
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {isLoading && <LoadingRow message="Loading incident…" />}
        {error     && <ErrorAlert message={error.message} />}

        {inc && (
          <>
            <div className="modal-title">Incident Detail</div>

            {/* ── Summary ── */}
            <div className="modal-section">
              <div className="modal-section-title">Summary</div>
              <div className="result-meta" style={{ marginBottom: 'var(--space-4)' }}>
                <SeverityBadge severity={inc.severity} />
                <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                  {inc.category}
                </span>
                <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                  {inc.error_type}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span className="text-sm text-muted">Confidence</span>
                  <ConfidenceBar score={inc.confidence_score} />
                </div>
              </div>

              <div className="stakeholder-box" style={{ marginBottom: 'var(--space-4)' }}>
                {inc.stakeholder_summary}
              </div>

              <div className="text-sm text-muted">
                Submitted: {formatDate(inc.submitted_at)}
                {' · '}
                AI triage: {formatDuration(inc.ai_triage_time_seconds)}
                {inc.manual_triage_time_seconds != null && (
                  <> · Manual triage: {formatDuration(inc.manual_triage_time_seconds)}</>
                )}
              </div>
            </div>

            {/* ── Original input ── */}
            <div className="modal-section">
              <div className="modal-section-title">Original Input</div>
              <pre style={{
                background: 'var(--surface-alt)',
                borderRadius: 'var(--radius)',
                padding: 'var(--space-4)',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-mono)',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                color: 'var(--text)',
                lineHeight: 1.5,
              }}>
                {inc.raw_input}
              </pre>
            </div>

            {/* ── Root causes ── */}
            <div className="modal-section">
              <div className="modal-section-title">Likely Root Causes</div>
              <ul className="bullet-list">
                {inc.root_causes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>

            {/* ── Steps ── */}
            <div className="modal-section">
              <div className="modal-section-title">Recommended Steps</div>
              <ol className="numbered-list">
                {inc.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>

            {/* ── Resolution status ── */}
            <div className="modal-section">
              <div className="modal-section-title">Resolution Status</div>
              <div className="flex-row">
                <StatusBadge status={inc.resolution_status} />
                {['Open', 'In Progress', 'Resolved'].map(s => (
                  <button
                    key={s}
                    className="btn btn-sm btn-secondary"
                    style={inc.resolution_status === s
                      ? { background: 'var(--accent-light)', color: 'var(--accent)', borderColor: 'var(--accent)' }
                      : {}}
                    onClick={() => statusMutation.mutate(s)}
                    disabled={statusMutation.isPending || inc.resolution_status === s}
                  >
                    {s}
                  </button>
                ))}
                {statusMutation.isError && (
                  <span className="text-sm" style={{ color: 'var(--sev-critical)' }}>
                    {statusMutation.error.message}
                  </span>
                )}
              </div>
            </div>

            {/* ── Recommendation feedback ── */}
            <div className="modal-section">
              <div className="modal-section-title">Recommendation Feedback</div>
              <div className="flex-row">
                <FeedbackBadge feedback={inc.recommendation_feedback} />
                <button
                  className={`btn btn-sm btn-success${inc.recommendation_feedback === 'accepted' ? ' active' : ''}`}
                  onClick={() => feedbackMutation.mutate('accepted')}
                  disabled={feedbackMutation.isPending || inc.recommendation_feedback === 'accepted'}
                  aria-pressed={inc.recommendation_feedback === 'accepted'}
                >
                  ✓ Accept
                </button>
                <button
                  className={`btn btn-sm btn-danger${inc.recommendation_feedback === 'rejected' ? ' active' : ''}`}
                  onClick={() => feedbackMutation.mutate('rejected')}
                  disabled={feedbackMutation.isPending || inc.recommendation_feedback === 'rejected'}
                  aria-pressed={inc.recommendation_feedback === 'rejected'}
                >
                  ✕ Reject
                </button>
                {feedbackMutation.isError && (
                  <span className="text-sm" style={{ color: 'var(--sev-critical)' }}>
                    {feedbackMutation.error.message}
                  </span>
                )}
              </div>
            </div>

            {/* ── Human review ── */}
            <div className="modal-section">
              <div className="modal-section-title">
                Human Review
                {inc.manually_reviewed && (
                  <span
                    className="badge badge-resolved"
                    style={{ marginLeft: 'var(--space-3)', textTransform: 'none', letterSpacing: 0 }}
                  >
                    ✓ Reviewed
                  </span>
                )}
              </div>

              {/* Saved review summary — shown when review has been completed */}
              {inc.manually_reviewed && (
                <div style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 'var(--space-3) var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-4)',
                }}>
                  <span>
                    <strong>Classification:</strong>{' '}
                    {inc.classification_correct === true  ? '✓ Correct'
                     : inc.classification_correct === false ? '✕ Incorrect'
                     : '—'}
                  </span>
                  <span>
                    <strong>Root cause:</strong>{' '}
                    {inc.root_cause_correct === true  ? '✓ Correct'
                     : inc.root_cause_correct === false ? '✕ Incorrect'
                     : '—'}
                  </span>
                  <span>
                    <strong>Misleading:</strong>{' '}
                    {inc.is_misleading === true  ? '⚠ Yes'
                     : inc.is_misleading === false ? '✓ No'
                     : '—'}
                  </span>
                </div>
              )}

              {/* The review form — keyed so React remounts with fresh state after each save */}
              <ReviewForm
                key={reviewKey}
                incident={inc}
                onSaved={handleReviewSaved}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
