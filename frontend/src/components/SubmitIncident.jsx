import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitIncident, updateFeedback } from '../api'
import {
  SeverityBadge, FeedbackBadge, ConfidenceBar,
  ErrorAlert, formatDate
} from './shared'

// ---------------------------------------------------------------------------
// Analysis result card — shown after a successful submission
// ---------------------------------------------------------------------------
function AnalysisResult({ incident, onFeedbackChange }) {
  const queryClient = useQueryClient()

  const feedbackMutation = useMutation({
    mutationFn: ({ id, feedback }) => updateFeedback(id, feedback),
    onSuccess: (updated) => {
      // Invalidate history and analytics so they refresh
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      onFeedbackChange(updated)
    },
  })

  const handleFeedback = (fb) => {
    if (feedbackMutation.isPending) return
    feedbackMutation.mutate({ id: incident.id, feedback: fb })
  }

  const currentFeedback = incident.recommendation_feedback

  return (
    <div className="card" style={{ marginTop: 'var(--space-6)' }}>
      {/* Meta row */}
      <div className="result-meta">
        <SeverityBadge severity={incident.severity} />
        <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
          {incident.category}
        </span>
        <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
          {incident.error_type}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="text-sm text-muted">Confidence</span>
          <ConfidenceBar score={incident.confidence_score} />
        </div>
      </div>

      {/* Stakeholder summary */}
      <div className="analysis-section">
        <div className="analysis-section-title">Summary for Stakeholders</div>
        <div className="stakeholder-box">
          {incident.stakeholder_summary}
        </div>
      </div>

      {/* Root causes */}
      <div className="analysis-section">
        <div className="analysis-section-title">Likely Root Causes</div>
        <ul className="bullet-list">
          {incident.root_causes.map((cause, i) => (
            <li key={i}>{cause}</li>
          ))}
        </ul>
      </div>

      {/* Troubleshooting steps */}
      <div className="analysis-section">
        <div className="analysis-section-title">Recommended Troubleshooting Steps</div>
        <ol className="numbered-list">
          {incident.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      {/* Feedback row */}
      <div className="feedback-row">
        <span className="feedback-label">Was this recommendation helpful?</span>
        {feedbackMutation.error && (
          <span className="text-sm" style={{ color: 'var(--sev-critical)' }}>
            {feedbackMutation.error.message}
          </span>
        )}
        <button
          className={`btn btn-sm btn-success${currentFeedback === 'accepted' ? ' active' : ''}`}
          onClick={() => handleFeedback('accepted')}
          disabled={feedbackMutation.isPending}
          aria-pressed={currentFeedback === 'accepted'}
        >
          ✓ Accept
        </button>
        <button
          className={`btn btn-sm btn-danger${currentFeedback === 'rejected' ? ' active' : ''}`}
          onClick={() => handleFeedback('rejected')}
          disabled={feedbackMutation.isPending}
          aria-pressed={currentFeedback === 'rejected'}
        >
          ✕ Reject
        </button>
        {currentFeedback !== 'pending' && (
          <FeedbackBadge feedback={currentFeedback} />
        )}
      </div>

      {/* Footer meta */}
      <div className="text-muted text-sm" style={{ marginTop: 'var(--space-4)' }}>
        Analysed in {incident.ai_triage_time_seconds != null
          ? `${incident.ai_triage_time_seconds.toFixed(2)}s`
          : '—'}
        {' · '}
        ID: <code>{incident.id}</code>
        {' · '}
        {formatDate(incident.submitted_at)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Submit form
// ---------------------------------------------------------------------------
export default function SubmitIncident({ onViewHistory }) {
  const [rawInput, setRawInput]               = useState('')
  const [manualSeconds, setManualSeconds]     = useState('')
  const [showManualTime, setShowManualTime]   = useState(false)
  const [result, setResult]                   = useState(null)
  const queryClient                            = useQueryClient()

  const inputError = rawInput.length > 0 && rawInput.length < 10
    ? 'Please provide at least 10 characters.'
    : null

  const submitMutation = useMutation({
    mutationFn: () => submitIncident(
      rawInput,
      showManualTime && manualSeconds ? parseInt(manualSeconds, 10) : null,
    ),
    onSuccess: (data) => {
      setResult(data)
      // Invalidate history + analytics so they refresh in background
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (rawInput.trim().length < 10) return
    setResult(null)
    submitMutation.mutate()
  }

  const handleReset = () => {
    setResult(null)
    setRawInput('')
    setManualSeconds('')
    submitMutation.reset()
  }

  return (
    <div>
      <div className="page-title">
        Submit Incident
        <div className="page-subtitle">
          Paste an error message, log snippet, or incident description for AI analysis
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} noValidate>
          {/* Raw input */}
          <div className="form-group">
            <label className="form-label" htmlFor="raw-input">
              Incident Description or Error Log
            </label>
            <textarea
              id="raw-input"
              className="form-control"
              rows={7}
              placeholder={
                'Paste your error message, stack trace, or incident description here…\n\n' +
                'Example: FATAL: connection to database timed out after 30s. ' +
                'Pool exhausted. Active connections: 100/100.'
              }
              value={rawInput}
              onChange={e => { setRawInput(e.target.value); submitMutation.reset() }}
              disabled={submitMutation.isPending}
              aria-describedby="raw-input-hint"
              aria-invalid={!!inputError}
            />
            {inputError
              ? <div className="form-error" id="raw-input-hint">{inputError}</div>
              : <div className="form-hint" id="raw-input-hint">
                  Minimum 10 characters. The more detail you provide, the better the analysis.
                </div>
            }
          </div>

          {/* Optional manual triage time */}
          <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setShowManualTime(v => !v)}
              aria-expanded={showManualTime}
            >
              {showManualTime ? '▾' : '▸'} Record manual triage time (optional)
            </button>
            <div className="form-hint" style={{ marginTop: 'var(--space-2)' }}>
              Used to measure metric 1 (median manual triage time vs AI time)
            </div>
          </div>

          {showManualTime && (
            <div className="form-group">
              <label className="form-label" htmlFor="manual-seconds">
                Time spent triaging manually (seconds)
              </label>
              <input
                id="manual-seconds"
                type="number"
                className="form-control"
                style={{ maxWidth: 220 }}
                placeholder="e.g. 480 = 8 minutes"
                min={0}
                value={manualSeconds}
                onChange={e => setManualSeconds(e.target.value)}
                disabled={submitMutation.isPending}
              />
              <div className="form-hint">
                How long did you spend on this before using the AI?
              </div>
            </div>
          )}

          {/* Submission error */}
          {submitMutation.isError && (
            <ErrorAlert message={submitMutation.error.message} />
          )}

          {/* Action buttons */}
          <div className="flex-row" style={{ marginTop: 'var(--space-5)' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitMutation.isPending || rawInput.trim().length < 10}
            >
              {submitMutation.isPending
                ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Analysing…</>
                : '🔍 Analyse Incident'
              }
            </button>
            {(result || submitMutation.isError) && (
              <button type="button" className="btn btn-secondary" onClick={handleReset}>
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Result */}
      {result && (
        <AnalysisResult
          incident={result}
          onFeedbackChange={updated => setResult(updated)}
        />
      )}

      {/* Post-submit actions */}
      {result && (
        <div className="flex-row" style={{ marginTop: 'var(--space-5)' }}>
          <button className="btn btn-secondary" onClick={onViewHistory}>
            View Incident History →
          </button>
          <button className="btn btn-secondary" onClick={handleReset}>
            Submit Another
          </button>
        </div>
      )}
    </div>
  )
}
