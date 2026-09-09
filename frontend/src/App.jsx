import { useState } from 'react'
import Dashboard from './components/Dashboard'
import SubmitIncident from './components/SubmitIncident'
import IncidentHistory from './components/IncidentHistory'

const TABS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'submit',     label: 'Submit Incident' },
  { id: 'history',    label: 'Incident History' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo">
          AI Incident <span>Copilot</span>
        </div>
        <nav className="app-nav" role="navigation" aria-label="Main navigation">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`nav-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'submit'    && <SubmitIncident onViewHistory={() => setActiveTab('history')} />}
        {activeTab === 'history'   && <IncidentHistory />}
      </main>
    </div>
  )
}
