import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getIncident, updateStatus, updateFeedback, submitReview } from '../api'
import {
  SeverityBadge, StatusBadge, FeedbackBadge,
  ConfidenceBar, LoadingRow, ErrorAlert, formatDate, formatDuration
} from './shared'

// ---------------------------------------------------------------------------
// Review form — calls PATCH /api/incidents/{id}/review
// ---------------------------------------------------------------------------
function ReviewForm({ incident, onSaved }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    classification_correct: incident.classification_correct ?? '',
    root_cause_correct:     incident.root_cause_correct     ?? '',
    is_misleading:          incident.is_misleading          ?? '',
    misleading_notes:       incident.misleading_notes       || '',
    review_notes:           incident.review_notes           || '',
    manual_triage_time_seconds: incident.manual_triage_time_seconds ?? '',
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {}
      if (form.classification_correct !== '') payload.classification_correct = form.classification_correct === 'true'
      if (form.root_cause_correct     !== '') payload.root_cause_correct     = form.root_cause_correct     === 'true'
      if (form.is_misleading          !== '') payload.is_misleading          = form.is_misleading          === 'true'
      if (form.misleading_notes)  payload.misleading_notes  = form.misleading_notes
      if (form.review_notes)      payload.review_notes      = form.review_notes
      if (form.manual_triage_time_seconds !== '')
        payload.manual_triage_time_seconds = parseInt(form.manual_triage_time_seconds, 10)
      return submitReview(incident.id, payload)
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      onSaved(updated)
    },
  })

  const boolSelect = (value, id, label) => (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="form-control"
        style={{ maxWidth: 200 }}
        value={value}
        onChange={e => setForm(prev => ({ ...prev, [id.replace('review-', '')]: e.target.value }))}
      >
        <option value="">— not yet evaluated —</option>
        <option value="true">✓ Yes / Correct</option>
        <option value="false">✕ No / Incorrect</option>
      </select>
    </div>
  )

  return (
    <form onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
      {boolSelect(form.classification_correct, 'review-classification_correct', 'Classification correct?')}
      {boolSelect(form.root_cause_correct,     'review-root_cause_correct',     'Root cause correct?')}
      {boolSelect(form.is_misleading,          'review-is_misleading',          'Was the response misleading or false?')}

      {form.is_misleading === 'true' && (
        <div className="form-group">
          <label className="form-label" htmlFor="review-misleading_notes">Misleading notes</label>
          <textarea
            id="review-misleading_notes"
            className="form-control"
            rows={2}
            value={form.misleading_notes}
            onChange={e => setForm(prev => ({ ...prev, misleading_notes: e.target.value }))}
          />
        </div>
      )}

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
          onChange={e => setForm(prev => ({ ...prev, manual_triage_time_seconds: e.target.value }))}
        />
        <div className="form-hint">Used for metric 1 (median manual triage time)</div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="review-review_notes">Review notes</label>
        <textarea
          id="review-review_notes"
          className="form-control"
          rows={2}
          placeholder="Optional free-text notes about this incident…"
          value={form.review_notes}
          onChange={e => setForm(prev => ({ ...prev, review_notes: e.target.value }))}
        />
      </div>

      {mutation.isError && <ErrorAlert message={mutation.error.message} />}

      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Saving…' : 'Save Review'}
      </button>

      {mutation.isSuccess && (
        <span className="text-sm" style={{ color: 'var(--feedback-accepted)', marginLeft: 'var(--space-3)' }}>
          ✓ Saved
        </span>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Incident detail modal
// ---------------------------------------------------------------------------
export default function IncidentDetail({ incidentId, onClose }) {
  const queryClient = useQueryClient()
  const [incident, setIncident] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['incident', incidentId],
    queryFn:  () => getIncident(incidentId),
  })

  // Keep local copy so mutations can update it without re-fetching
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

  // Trap focus / close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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
            <div className="modal-title">
              Incident Detail
            </div>

            {/* ── Meta ── */}
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

            {/* ── Raw input ── */}
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

            {/* ── Status ── */}
            <div className="modal-section">
              <div className="modal-section-title">Resolution Status</div>
              <div className="flex-row">
                <StatusBadge status={inc.resolution_status} />
                {['Open', 'In Progress', 'Resolved'].map(s => (
                  <button
                    key={s}
                    className={`btn btn-sm btn-secondary${inc.resolution_status === s ? ' active' : ''}`}
                    style={inc.resolution_status === s ? { background: 'var(--accent-light)', color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
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

            {/* ── Feedback ── */}
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
                  <span className="badge badge-resolved" style={{ marginLeft: 'var(--space-3)', textTransform: 'none', letterSpacing: 0 }}>
                    Reviewed
                  </span>
                )}
              </div>
              <ReviewForm
                incident={inc}
                onSaved={(updated) => setIncident(updated)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
