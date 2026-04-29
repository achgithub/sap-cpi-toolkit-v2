import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxAlignItems,
  MessageStrip,
} from '@ui5/webcomponents-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CCStatus {
  running: boolean
  status_code?: number
}

interface MockInfo {
  tls_port: string
  cert_pem: string
}

// ── Step component ────────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(n === 1)
  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '0.375rem', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.6rem 0.75rem', background: open ? 'var(--sapList_SelectionBackgroundColor)' : 'var(--sapList_Background)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          width: '1.5rem', height: '1.5rem', borderRadius: '50%', flexShrink: 0,
          background: 'var(--sapHighlightColor)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 700,
        }}>{n}</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 600, flex: 1 }}>{title}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0.75rem 1rem 0.75rem 3rem', background: 'var(--sapGroup_ContentBackground)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function Code({ children }: { children: string }) {
  return (
    <pre style={{
      margin: '0.4rem 0', padding: '0.5rem 0.75rem', borderRadius: '0.25rem',
      background: 'var(--sapGroup_ContentBackground)', border: '1px solid var(--sapList_BorderColor)',
      fontFamily: 'monospace', fontSize: '0.82rem', overflowX: 'auto', whiteSpace: 'pre-wrap',
    }}>
      {children}
    </pre>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px dotted var(--sapList_BorderColor)' }}>
      <span style={{ width: '10rem', flexShrink: 0, fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>{label}</span>
      <code style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 600 }}>{value}</code>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CloudConnector() {
  const [status, setStatus]   = useState<CCStatus | null>(null)
  const [mockInfo, setMockInfo] = useState<MockInfo | null>(null)

  const checkStatus = useCallback(async () => {
    const res = await fetch('/api/v2/cloud-connector/status').catch(() => null)
    if (res?.ok) setStatus(await res.json())
  }, [])

  useEffect(() => {
    checkStatus()
    fetch('/api/v2/mock-server/info').then(r => r.json()).then(setMockInfo).catch(() => {})
  }, [checkStatus])

  // Poll CC status every 5s
  useEffect(() => {
    const id = setInterval(checkStatus, 5000)
    return () => clearInterval(id)
  }, [checkStatus])

  function downloadCert() {
    if (!mockInfo?.cert_pem) return
    const blob = new Blob([mockInfo.cert_pem], { type: 'application/x-pem-file' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'mock-server.crt'; a.click()
    URL.revokeObjectURL(url)
  }

  const tlsPort = mockInfo?.tls_port ?? '8444'
  const isRunning = status?.running === true
  const isChecked = status !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>

      {/* Status */}
      <Card header={
        <CardHeader
          titleText="SAP Cloud Connector"
          subtitleText="Bridges SAP BTP cloud tenants to your local mock server"
          action={
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                fontSize: '0.875rem', fontWeight: 600,
                color: !isChecked ? 'var(--sapContent_LabelColor)' : isRunning ? 'var(--sapPositiveColor)' : 'var(--sapNegativeColor)',
              }}>
                <span style={{ fontSize: '1rem' }}>{!isChecked ? '○' : isRunning ? '●' : '○'}</span>
                {!isChecked ? 'Checking…' : isRunning ? 'Running' : 'Not running'}
              </span>
              <Button design="Transparent" icon="refresh" onClick={checkStatus}>Refresh</Button>
            </FlexBox>
          }
        />
      }>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {!isRunning && isChecked && (
            <MessageStrip design="Critical" hideCloseButton>
              Cloud Connector is not running. Start it with the command below, then refresh.
            </MessageStrip>
          )}

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '0.25rem', fontWeight: 600 }}>START COMMAND</div>
            <Code>docker compose --profile scc -f deployments/local/docker-compose.yml up -d</Code>
          </div>

          {isRunning && (
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <Button
                icon="action"
                design="Emphasized"
                onClick={() => window.open('https://localhost:8443', '_blank')}
              >
                Open CC Admin UI
              </Button>
              <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                Default login: <code>Administrator</code> / <code>manage</code>
              </span>
            </FlexBox>
          )}

        </div>
      </Card>

      {/* Mock server connection details */}
      <Card header={<CardHeader titleText="Mock Server Connection" subtitleText="Values to use when mapping the mock server in CC" />}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <MessageStrip design="Information" hideCloseButton>
            Use <strong>host.docker.internal</strong> (not the Docker service name <code>api</code>) — Cloud Connector runs in its own Docker network context and resolves the host machine this way. Port 8444 is exposed on the host so it is reachable.
          </MessageStrip>
          <Field label="Internal Host"     value="host.docker.internal" />
          <Field label="Internal Port"     value={tlsPort} />
          <Field label="Protocol"          value="HTTPS" />
          <Field label="Suggested Virtual Host" value="mock-server.toolkit" />
          <Field label="Suggested Virtual Port" value="443" />
          <Field label="Resource path"     value="/mock/" />

          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem', marginTop: '0.25rem' }}>
            <Button icon="download" disabled={!mockInfo?.cert_pem} onClick={downloadCert}>
              Download Mock Server Certificate
            </Button>
            <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
              Import this into CC → Certificate Store → Backend Certificates
            </span>
          </FlexBox>
        </div>
      </Card>

      {/* Setup guide */}
      <Card header={<CardHeader titleText="Setup Guide" subtitleText="One-time configuration — expand each step" />}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

          <Step n={1} title="Start Cloud Connector">
            <p>Run the following from the <code>sap-cpi-toolkit-v2</code> project root:</p>
            <Code>docker compose --profile scc -f deployments/local/docker-compose.yml up -d</Code>
            <p>Wait ~20 seconds for CC to fully start, then click <strong>Refresh</strong> above. The status dot will turn green.</p>
          </Step>

          <Step n={2} title="Open the Admin UI and set a password">
            <p>Open <strong>https://localhost:8443</strong> in your browser. Accept the self-signed CC certificate warning.</p>
            <p>Login with: <code>Administrator</code> / <code>manage</code></p>
            <p>You will be prompted to change the password on first login.</p>
          </Step>

          <Step n={3} title="Connect your BTP subaccount">
            <p>In the CC admin, go to <strong>Connector → Add Subaccount</strong> and enter:</p>
            <Field label="Region host"   value="&lt;your-btp-host&gt;.hana.ondemand.com" />
            <Field label="Subaccount ID" value="&lt;your subaccount ID&gt;" />
            <Field label="Login e-mail"  value="&lt;your BTP user&gt;" />
            <Field label="Password"      value="&lt;your BTP password&gt;" />
            <p style={{ marginTop: '0.5rem' }}>The connector status should change to <strong>Connected</strong>.</p>
          </Step>

          <Step n={4} title="Add a system mapping for the mock server">
            <p>Go to <strong>Cloud to On-Premise → Add</strong> and fill in:</p>
            <Field label="Backend type"  value="Non-SAP System" />
            <Field label="Protocol"      value="HTTPS" />
            <Field label="Internal host" value="host.docker.internal" />
            <Field label="Internal port" value={tlsPort} />
            <Field label="Virtual host"  value="mock-server.toolkit" />
            <Field label="Virtual port"  value="443" />
            <p style={{ marginTop: '0.5rem' }}>Click <strong>Finish</strong>, then open the mapping and add a resource:</p>
            <Field label="URL path"    value="/mock/" />
            <Field label="Accessible"  value="Enabled" />
          </Step>

          <Step n={5} title="Import the mock server certificate">
            <p>Download the mock server certificate using the button above, then in CC go to:</p>
            <p><strong>Configuration → On-Premise to Cloud → Certificate Store → Manage Certificates for Backend Connection</strong></p>
            <p>Click <strong>Add</strong>, upload <code>mock-server.crt</code>, and save.</p>
            <p>This only needs to be done once — the certificate is stable across restarts unless you explicitly regenerate it in the Mock Server tool.</p>
          </Step>

          <Step n={6} title="Create a BTP destination">
            <p>In SAP BTP Cockpit, go to <strong>Connectivity → Destinations → New Destination</strong>:</p>
            <Field label="Name"              value="MockServer" />
            <Field label="Type"              value="HTTP" />
            <Field label="URL"               value="https://mock-server.toolkit/mock" />
            <Field label="Proxy type"        value="OnPremise" />
            <Field label="Authentication"    value="NoAuthentication" />
            <p style={{ marginTop: '0.5rem' }}>Save and click <strong>Check Connection</strong> — it should return HTTP 404 (no endpoint configured yet, but connection works).</p>
          </Step>

          <Step n={7} title="Configure your iFlow">
            <p>In your iFlow HTTP receiver adapter, set:</p>
            <Field label="Address"     value="https://mock-server.toolkit/mock/your-path" />
            <Field label="Proxy type"  value="On-Premise" />
            <Field label="Location ID" value="(leave blank unless you set one in CC)" />
            <p style={{ marginTop: '0.5rem' }}>
              Deploy the iFlow and trigger it. The request will appear in the <strong>Mock Server → Request Log</strong> within seconds.
            </p>
          </Step>

        </div>
      </Card>

    </div>
  )
}
