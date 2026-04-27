import PhaseLayout from '../../components/PhaseLayout'
import MessageList from './MessageList'
import Dashboard from './Dashboard'

const MONITORING_NAV = [
  { id: 'dashboard',   label: 'Dashboard',      icon: 'grid'                },
  { id: 'messages',    label: 'Messages',        icon: 'message-information' },
  { id: 'failed',      label: 'Failed',          icon: 'message-error'       },
  { id: 'search',      label: 'Message Search',  icon: 'search'              },
  { id: 'run-results', label: 'Run Results',     icon: 'bar-chart'           },
]

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 2rem', gap: '0.75rem' }}>
      <span style={{ fontFamily: 'var(--sapFontHeaderFamily)', fontSize: 'var(--sapFontHeader3Size)', color: 'var(--sapTextColor)' }}>{title}</span>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center', maxWidth: '480px' }}>{description}</span>
    </div>
  )
}

export default function MonitoringPhase() {
  return (
    <PhaseLayout storageKey="v2-monitoring" items={MONITORING_NAV}>
      {(id) => (
        <>
          {id === 'dashboard'   && <Dashboard />}
          {id === 'messages'    && <MessageList defaultTimeRange="Past Hour" />}
          {id === 'failed'      && <MessageList defaultTimeRange="Past Hour" defaultStatus="FAILED" />}
          {id === 'search'      && <MessageList defaultTimeRange="Past Week" focusSearch />}
          {id === 'run-results' && <Placeholder title="Run Results" description="Pass/fail counts, latency distribution, and error breakdown from volume test runs. Coming in Step 4." />}
        </>
      )}
    </PhaseLayout>
  )
}
