import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listIncidents } from '../api'
import { SeverityBadge, StatusBadge, FeedbackBadge, LoadingRow, ErrorAlert, EmptyState, formatDate } from './shared'
import IncidentDetail from './IncidentDetail'

const PAGE_SIZE = 20

const SEVERITY_OPTIONS = ['', 'Critical', 'High', 'Medium', 'Low']
const STATUS_OPTIONS   = ['', 'Open', 'In Progress', 'Resolved']
const CATEGORY_OPTIONS = ['', 'Database', 'Network', 'Auth', 'Storage', 'Application', 'Infrastructure', 'Security', 'Other']

export default function IncidentHistory() {
  const [filters, setFilters]       = useState({ severity: '', resolution_status: '', category: '' })
  const [skip, setSkip]             = useState(0)
  const [selected, setSelected]     = useState(null)

  const queryParams = {
    ...filters,
    skip,
    limit: PAGE_SIZE,
  }

  const { data: incidents = [], isLoading, error, refetch } = useQuery({
    queryKey: ['incidents', queryParams],
    queryFn:  () => listIncidents(queryParams),
  })

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setSkip(0)
  }

  const hasPrev = skip > 0
  const hasNext = incidents.length === PAGE_SIZE

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>
          Incident History
          <div className="page-subtitle">All analysed incidents, newest first</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div>
          <label className="form-label text-sm" htmlFor="filter-severity">Severity</label>
          <select
            id="filter-severity"
            className="form-control"
            value={filters.severity}
            onChange={e => handleFilterChange('severity', e.target.value)}
          >
            {SEVERITY_OPTIONS.map(o => (
              <option key={o} value={o}>{o || 'All severities'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label text-sm" htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            className="form-control"
            value={filters.resolution_status}
            onChange={e => handleFilterChange('resolution_status', e.target.value)}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o} value={o}>{o || 'All statuses'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label text-sm" htmlFor="filter-category">Category</label>
          <select
            id="filter-category"
            className="form-control"
            value={filters.category}
            onChange={e => handleFilterChange('category', e.target.value)}
          >
            {CATEGORY_OPTIONS.map(o => (
              <option key={o} value={o}>{o || 'All categories'}</option>
            ))}
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => { setFilters({ severity: '', resolution_status: '', category: '' }); setSkip(0) }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <ErrorAlert message={error.message} />}

      {/* Loading */}
      {isLoading && <LoadingRow message="Loading incidents…" />}

      {/* Empty state */}
      {!isLoading && !error && incidents.length === 0 && (
        <EmptyState icon="📋" message="No incidents match the current filters. Submit your first incident to get started." />
      )}

      {/* Table */}
      {!isLoading && incidents.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Error Type</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Feedback</th>
                <th>Reviewed</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => (
                <tr
                  key={inc.id}
                  onClick={() => setSelected(inc.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelected(inc.id)}
                  aria-label={`View incident ${inc.id}`}
                >
                  <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>
                    {formatDate(inc.submitted_at)}
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                      {inc.category || '—'}
                    </span>
                  </td>
                  <td className="td-muted">{inc.error_type || '—'}</td>
                  <td><SeverityBadge severity={inc.severity} /></td>
                  <td><StatusBadge status={inc.resolution_status} /></td>
                  <td><FeedbackBadge feedback={inc.recommendation_feedback} /></td>
                  <td>
                    <span className={`badge ${inc.manually_reviewed ? 'badge-resolved' : 'badge-pending'}`}>
                      {inc.manually_reviewed ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="truncate" style={{ maxWidth: 260 }}>
                    <span title={inc.raw_input} className="td-muted">
                      {inc.raw_input.length > 80 ? inc.raw_input.slice(0, 80) + '…' : inc.raw_input}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && (hasPrev || hasNext) && (
        <div className="flex-row" style={{ marginTop: 'var(--space-4)', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            disabled={!hasPrev}
          >
            ← Previous
          </button>
          <span className="text-sm text-muted">
            Showing {skip + 1}–{skip + incidents.length}
          </span>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setSkip(skip + PAGE_SIZE)}
            disabled={!hasNext}
          >
            Next →
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <IncidentDetail
          incidentId={selected}
          onClose={() => { setSelected(null); refetch() }}
        />
      )}
    </div>
  )
}
