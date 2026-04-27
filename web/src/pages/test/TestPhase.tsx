import PhaseLayout from '../../components/PhaseLayout'

const TEST_NAV = [
  { id: 'http-client',   label: 'HTTP Client',       icon: 'internet-browser'  },
  { id: 'test-packs',    label: 'Test Packs',         icon: 'task'              },
  { id: 'volume-runner', label: 'Volume Runner',      icon: 'time-overtime'     },
  { id: 'scheduler',     label: 'Scheduler',          icon: 'appointment-2'     },
  { id: 'mock-server',   label: 'HTTP Mock Server',   icon: 'simulate'          },
  { id: 'test-data',     label: 'Test Data Generator',icon: 'generate-shortcut' },
]

function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 2rem', gap: '0.75rem' }}>
      <span style={{ fontFamily: 'var(--sapFontHeaderFamily)', fontSize: 'var(--sapFontHeader3Size)', color: 'var(--sapTextColor)' }}>{title}</span>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center', maxWidth: '480px' }}>{description}</span>
    </div>
  )
}

export default function TestPhase() {
  return (
    <PhaseLayout storageKey="v2-test" items={TEST_NAV}>
      {(id) => (
        <>
          {id === 'http-client'   && <Placeholder title="HTTP Client"         description="Project-aware request runner with saved configs and instance linking. Migrating from V1 in Step 2." />}
          {id === 'test-packs'    && <Placeholder title="Test Packs"          description="Named collections of test cases with optional status and body assertions. Persisted per project. Coming in Step 4." />}
          {id === 'volume-runner' && <Placeholder title="Volume Runner"       description="HTTP burst mode and SFTP drop mode. Run a test pack N times with concurrency control. Results exportable as TXT. Coming in Step 4." />}
          {id === 'scheduler'     && <Placeholder title="Scheduler"           description="In-memory cron scheduler. Fires test packs against an instance on a schedule. Coming in Step 4." />}
          {id === 'mock-server'   && <Placeholder title="HTTP Mock Server"    description="Receive iFlow outbound calls, assert responses, absorb volume test load. Coming in Step 6." />}
          {id === 'test-data'     && <Placeholder title="Test Data Generator" description="XSD-aware payload generation. Pulls source XSD from the project library. Coming in Step 3." />}
        </>
      )}
    </PhaseLayout>
  )
}
