import { useQuery } from '@tanstack/react-query'
import { getAnalyticsSummary } from '../api'
import { LoadingRow, ErrorAlert, formatDuration } from './shared'

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
function KpiCard({ label, value, sub, colorClass }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${colorClass ?? ''}`}>{value ?? '—'}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Horizontal bar chart (plain CSS — no external library)
// ---------------------------------------------------------------------------
function BarChart({ items, labelKey, countKey, color }) {
  if (!items || items.length === 0) {
    return <p className="text-muted text-sm">No data yet.</p>
  }
  const max = Math.max(...items.map(i => i[countKey] ?? 0))
  return (
    <div>
      {items.map((item, idx) => {
        const count = item[countKey] ?? 0
        const pct   = max > 0 ? (count / max) * 100 : 0
        return (
          <div className="chart-bar-row" key={idx}>
            <div className="chart-bar-label" title={item[labelKey]}>
              {item[labelKey] || 'Unknown'}
            </div>
            <div className="chart-bar-track">
              <div
                className="chart-bar-fill"
                style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }}
              />
            </div>
            <div className="chart-bar-count">{count}</div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Donut chart (SVG — no external library)
// ---------------------------------------------------------------------------
function DonutChart({ segments }) {
  // segments: [{label, value, color}]
  const total = segments.reduce((s, seg) => s + (seg.value ?? 0), 0)
  if (total === 0) return <p className="text-muted text-sm">No data yet.</p>

  const r = 36
  const cx = 50, cy = 50
  const circumference = 2 * Math.PI * r

  let cumulative = 0
  const arcs = segments.map(seg => {
    const frac   = seg.value / total
    const offset = circumference * (1 - cumulative)
    const dash   = circumference * frac
    cumulative  += frac
    return { ...seg, dash, offset, frac }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
      <svg viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="14"
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={arc.offset}
            transform="rotate(-90 50 50)"
          />
        ))}
        <text x="50" y="46" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text)">{total}</text>
        <text x="50" y="58" textAnchor="middle" fontSize="7" fill="var(--text-muted)">total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {segments.map((seg, i) => (
          <div key={i} className="flex-row" style={{ gap: 'var(--space-2)' }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              background: seg.color, flexShrink: 0,
            }} />
            <span className="text-sm text-muted">{seg.label}</span>
            <span className="text-sm" style={{ marginLeft: 'auto', fontWeight: 600 }}>
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: getAnalyticsSummary,
    refetchInterval: 30_000,   // auto-refresh every 30s
  })

  if (isLoading) return <LoadingRow message="Loading analytics…" />
  if (error)     return <ErrorAlert message={error.message} />

  const d = data

  // Resolution donut segments
  const resolutionSegments = [
    { label: 'Open',        value: d.resolution_breakdown?.open        ?? 0, color: 'var(--sev-critical)' },
    { label: 'In Progress', value: d.resolution_breakdown?.in_progress ?? 0, color: 'var(--sev-medium)' },
    { label: 'Resolved',    value: d.resolution_breakdown?.resolved    ?? 0, color: 'var(--sev-low)' },
  ]

  // Feedback donut segments
  const feedbackSegments = [
    { label: 'Accepted', value: d.feedback_breakdown?.accepted ?? 0, color: 'var(--feedback-accepted)' },
    { label: 'Rejected', value: d.feedback_breakdown?.rejected ?? 0, color: 'var(--feedback-rejected)' },
    { label: 'Pending',  value: d.feedback_breakdown?.pending  ?? 0, color: 'var(--border)' },
  ]

  // Time reduction display
  const timeReduction = d.pct_time_reduction != null
    ? `${d.pct_time_reduction}%`
    : '—'

  const avgConfidence = d.avg_confidence_score != null
    ? `${Math.round(d.avg_confidence_score * 100)}%`
    : '—'

  const classAccuracy = d.classification_accuracy_pct != null
    ? `${d.classification_accuracy_pct}%`
    : '—'

  const acceptanceRate = d.recommendation_acceptance_rate_pct != null
    ? `${d.recommendation_acceptance_rate_pct}%`
    : '—'

  return (
    <div>
      <div className="page-title">
        Dashboard
        <div className="page-subtitle">Analytics across all analysed incidents</div>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        <KpiCard
          label="Total Incidents"
          value={d.total_incidents}
          colorClass="accent"
        />
        <KpiCard
          label="AI Confidence"
          value={avgConfidence}
          sub="avg across all incidents"
          colorClass={d.avg_confidence_score >= 0.8 ? 'green' : d.avg_confidence_score >= 0.6 ? 'orange' : 'red'}
        />
        <KpiCard
          label="Time Reduction"
          value={timeReduction}
          sub={d.median_manual_triage_seconds != null
            ? `${formatDuration(d.median_manual_triage_seconds)} → ${formatDuration(d.median_ai_triage_seconds)}`
            : 'supply manual triage time to measure'}
        />
        <KpiCard
          label="Classification Accuracy"
          value={classAccuracy}
          sub={`${d.classification_reviewed_count ?? 0} reviewed`}
          colorClass={d.classification_accuracy_pct >= 80 ? 'green' : d.classification_accuracy_pct >= 60 ? 'orange' : undefined}
        />
        <KpiCard
          label="Acceptance Rate"
          value={acceptanceRate}
          sub="AI recommendations accepted"
          colorClass={d.recommendation_acceptance_rate_pct >= 70 ? 'green' : 'orange'}
        />
        <KpiCard
          label="Misleading Rate"
          value={d.misleading_rate_pct != null ? `${d.misleading_rate_pct}%` : '—'}
          sub={`${d.misleading_reviewed_count ?? 0} reviewed`}
          colorClass={d.misleading_rate_pct > 10 ? 'red' : 'green'}
        />
        <KpiCard
          label="Manual Reviews"
          value={d.manual_review_count ?? 0}
          sub={`${d.manual_review_rate_pct ?? 0}% reviewed`}
        />
      </div>

      {/* Charts row 1: resolution + feedback */}
      <div className="charts-row">
        <div className="card">
          <div className="card-title">Resolution Status</div>
          <DonutChart segments={resolutionSegments} />
        </div>
        <div className="card">
          <div className="card-title">Recommendation Feedback</div>
          <DonutChart segments={feedbackSegments} />
        </div>
      </div>

      {/* Charts row 2: by category + by error type */}
      <div className="charts-row">
        <div className="card">
          <div className="card-title">Incidents by Category</div>
          <BarChart
            items={d.incidents_by_category ?? []}
            labelKey="category"
            countKey="count"
          />
        </div>
        <div className="card">
          <div className="card-title">Top Error Types</div>
          <BarChart
            items={d.top_error_types ?? []}
            labelKey="error_type"
            countKey="count"
            color="var(--sev-high)"
          />
        </div>
      </div>

      {/* Performance by severity */}
      {d.performance_by_severity?.length > 0 && (
        <div className="card section-gap">
          <div className="card-title">Performance by Severity (metric 9)</div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Incidents</th>
                  <th>Avg Confidence</th>
                  <th>Classification Accuracy</th>
                  <th>Acceptance Rate</th>
                  <th>Misleading Rate</th>
                </tr>
              </thead>
              <tbody>
                {d.performance_by_severity.map(row => (
                  <tr key={row.severity}>
                    <td><span className={`badge badge-${row.severity?.toLowerCase()}`}>{row.severity}</span></td>
                    <td>{row.count}</td>
                    <td>{row.avg_confidence_score != null ? `${Math.round(row.avg_confidence_score * 100)}%` : '—'}</td>
                    <td>{row.classification_accuracy_pct != null ? `${row.classification_accuracy_pct}%` : '—'}</td>
                    <td>{row.recommendation_acceptance_rate_pct != null ? `${row.recommendation_acceptance_rate_pct}%` : '—'}</td>
                    <td>{row.misleading_rate_pct != null ? `${row.misleading_rate_pct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Incidents over time */}
      {d.incidents_by_date?.length > 1 && (
        <div className="card section-gap">
          <div className="card-title">Incidents Over Time</div>
          <BarChart
            items={d.incidents_by_date ?? []}
            labelKey="date"
            countKey="count"
            color="var(--accent)"
          />
        </div>
      )}

      {d.total_incidents === 0 && (
        <div className="card section-gap" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No incidents yet. Submit your first incident to see analytics.
          </p>
        </div>
      )}
    </div>
  )
}
