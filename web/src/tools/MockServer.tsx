import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CheckBox,
  Dialog,
  FlexBox,
  FlexBoxAlignItems,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  TextArea,
} from '@ui5/webcomponents-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface CertInfo {
  subject: string
  issuer: string
  not_before: string
  not_after: string
  fingerprint: string
  self_signed: boolean
}

interface MockEndpoint {
  id: string
  name: string
  method: string
  path_pattern: string
  response_status: number
  response_headers: Record<string, string>
  response_body: string
  latency_ms: number
  enabled: boolean
  hit_count: number
  created_at: string
}

interface MockRequest {
  id: string
  endpoint_id: string | null
  method: string
  path: string
  request_headers: Record<string, string>
  request_body: string
  response_status: number
  matched: boolean
  received_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHODS = ['*', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']

function methodBadge(m: string) {
  const colours: Record<string, string> = {
    GET:    '#2196F3', POST: '#4CAF50', PUT:   '#FF9800',
    DELETE: '#F44336', PATCH:'#9C27B0', '*':   '#607D8B',
  }
  return (
    <span style={{
      background: colours[m] ?? '#607D8B',
      color: '#fff', fontSize: '0.7rem', fontWeight: 700,
      padding: '0.1rem 0.4rem', borderRadius: '0.2rem',
      minWidth: '3.5rem', textAlign: 'center', display: 'inline-block',
    }}>
      {m === '*' ? 'ANY' : m}
    </span>
  )
}

function statusBadge(s: number, matched: boolean) {
  const colour = !matched ? 'var(--sapNegativeColor)' :
    s < 300 ? 'var(--sapPositiveColor)' :
    s < 400 ? 'var(--sapWarningColor)' : 'var(--sapNegativeColor)'
  return <span style={{ fontSize: '0.8rem', fontWeight: 700, color: colour }}>{s}</span>
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function mockBaseUrl(tlsPort: string) {
  return `https://${window.location.hostname}:${tlsPort}/mock`
}

// ── Endpoint Editor ───────────────────────────────────────────────────────────

interface EditorProps {
  open: boolean
  ep: Partial<MockEndpoint> | null
  onSave: (data: Partial<MockEndpoint>) => void
  onClose: () => void
}

function EndpointEditor({ open, ep, onSave, onClose }: EditorProps) {
  const [name, setName]           = useState('')
  const [method, setMethod]       = useState('*')
  const [path, setPath]           = useState('/')
  const [status, setStatus]       = useState('200')
  const [headersRaw, setHeaders]  = useState('')
  const [body, setBody]           = useState('')
  const [latency, setLatency]     = useState('0')
  const [enabled, setEnabled]     = useState(true)

  useEffect(() => {
    if (!open) return
    setName(ep?.name ?? '')
    setMethod(ep?.method ?? '*')
    setPath(ep?.path_pattern ?? '/')
    setStatus(String(ep?.response_status ?? 200))
    setHeaders(ep?.response_headers
      ? Object.entries(ep.response_headers).map(([k, v]) => `${k}: ${v}`).join('\n')
      : '')
    setBody(ep?.response_body ?? '')
    setLatency(String(ep?.latency_ms ?? 0))
    setEnabled(ep?.enabled ?? true)
  }, [open, ep])

  function buildHeaders(): Record<string, string> {
    const out: Record<string, string> = {}
    headersRaw.split('\n').forEach(line => {
      const idx = line.indexOf(':')
      if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    })
    return out
  }

  function handleSave() {
    onSave({
      name, method, path_pattern: path,
      response_status: parseInt(status) || 200,
      response_headers: buildHeaders(),
      response_body: body,
      latency_ms: parseInt(latency) || 0,
      enabled,
    })
  }

  return (
    <Dialog
      open={open}
      headerText={ep?.id ? 'Edit Endpoint' : 'New Endpoint'}
      style={{ width: '560px' }}
      footer={
        <FlexBox style={{ gap: '0.5rem', padding: '0.5rem' }}>
          <Button design="Emphasized" onClick={handleSave} disabled={!name.trim() || !path.trim()}>{ep?.id ? 'Save' : 'Create'}</Button>
          <Button onClick={onClose}>Cancel</Button>
        </FlexBox>
      }
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>

        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0 }}>Name</Label>
          <Input value={name} onInput={e => setName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} placeholder="e.g. Create order" />
        </FlexBox>

        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0 }}>Method</Label>
          <Select onChange={e => setMethod((e.target as unknown as HTMLSelectElement).value)} style={{ width: '110px' }}>
            {METHODS.map(m => <Option key={m} value={m} selected={m === method}>{m === '*' ? 'ANY' : m}</Option>)}
          </Select>
          <Input value={path} onInput={e => setPath((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} placeholder="/orders/{id}" />
        </FlexBox>

        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0 }}>Status</Label>
          <Input value={status} onInput={e => setStatus((e.target as unknown as HTMLInputElement).value)} style={{ width: '80px' }} />
          <Label style={{ marginLeft: '1rem' }}>Latency</Label>
          <Input value={latency} onInput={e => setLatency((e.target as unknown as HTMLInputElement).value)} style={{ width: '80px' }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>ms</span>
        </FlexBox>

        <FlexBox alignItems={FlexBoxAlignItems.Start} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0, marginTop: '0.4rem' }}>Headers</Label>
          <TextArea value={headersRaw} onInput={e => setHeaders((e.target as unknown as HTMLTextAreaElement).value)} rows={3} style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }} placeholder={'Content-Type: application/xml\nX-Custom: value'} />
        </FlexBox>

        <FlexBox alignItems={FlexBoxAlignItems.Start} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0, marginTop: '0.4rem' }}>Body</Label>
          <TextArea value={body} onInput={e => setBody((e.target as unknown as HTMLTextAreaElement).value)} rows={6} style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }} placeholder={'{ "status": "ok" }'} />
        </FlexBox>

        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0 }}></Label>
          <CheckBox text="Enabled" checked={enabled} onChange={e => setEnabled((e.target as unknown as HTMLInputElement).checked)} />
        </FlexBox>

      </div>
    </Dialog>
  )
}

// ── Request Detail Dialog ─────────────────────────────────────────────────────

function RequestDetail({ req, onClose }: { req: MockRequest | null, onClose: () => void }) {
  if (!req) return null
  return (
    <Dialog open={!!req} headerText="Request Detail" style={{ width: '560px' }} footer={<Button style={{ margin: '0.5rem' }} onClick={onClose}>Close</Button>} onClose={onClose}>
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {methodBadge(req.method)}
          <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{req.path}</span>
          {statusBadge(req.response_status, req.matched)}
        </div>
        {!req.matched && (
          <MessageStrip design="Critical" hideCloseButton>No endpoint matched this request</MessageStrip>
        )}
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '0.25rem', fontWeight: 600 }}>REQUEST HEADERS</div>
          <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.8rem', background: 'var(--sapGroup_ContentBackground)', padding: '0.5rem', borderRadius: '0.25rem', overflow: 'auto', maxHeight: '120px' }}>
            {Object.entries(req.request_headers).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)'}
          </pre>
        </div>
        {req.request_body && (
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '0.25rem', fontWeight: 600 }}>REQUEST BODY</div>
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.8rem', background: 'var(--sapGroup_ContentBackground)', padding: '0.5rem', borderRadius: '0.25rem', overflow: 'auto', maxHeight: '180px' }}>
              {req.request_body}
            </pre>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MockServer() {
  const [endpoints, setEndpoints]     = useState<MockEndpoint[]>([])
  const [requests, setRequests]       = useState<MockRequest[]>([])
  const [editorOpen, setEditorOpen]   = useState(false)
  const [editing, setEditing]         = useState<Partial<MockEndpoint> | null>(null)
  const [detail, setDetail]           = useState<MockRequest | null>(null)
  const [error, setError]             = useState('')
  const [liveLog, setLiveLog]         = useState(true)
  const prevCountRef                  = useRef(0)
  const [tlsPort, setTlsPort]         = useState('8444')
  const [certPEM, setCertPEM]         = useState('')
  const [certInfo, setCertInfo]       = useState<CertInfo | null>(null)
  const [certMode, setCertMode]       = useState<'auto'|'custom'>('auto')
  const [customCertPEM, setCustomCertPEM] = useState('')
  const [customKeyPEM, setCustomKeyPEM]   = useState('')
  const [certSaving, setCertSaving]   = useState(false)
  const [certError, setCertError]     = useState('')
  const [certSuccess, setCertSuccess] = useState('')

  const loadEndpoints = useCallback(async () => {
    const res = await fetch('/api/v2/mock-endpoints')
    if (res.ok) setEndpoints(await res.json())
  }, [])

  const loadRequests = useCallback(async () => {
    const res = await fetch('/api/v2/mock-requests')
    if (res.ok) {
      const data: MockRequest[] = await res.json()
      setRequests(data)
      prevCountRef.current = data.length
    }
  }, [])

  useEffect(() => {
    fetch('/api/v2/mock-server/info')
      .then(r => r.json())
      .then((d: { tls_port: string; cert_pem: string; cert_info: CertInfo }) => {
        if (d.tls_port) setTlsPort(d.tls_port)
        if (d.cert_pem) setCertPEM(d.cert_pem)
        if (d.cert_info) setCertInfo(d.cert_info)
      })
      .catch(() => {})
    fetch('/api/v2/mock-server/cert')
      .then(r => r.json())
      .then((d: { mode: string }) => { if (d.mode) setCertMode(d.mode as 'auto'|'custom') })
      .catch(() => {})
    loadEndpoints()
    loadRequests()
  }, [loadEndpoints, loadRequests])

  function downloadCert() {
    const blob = new Blob([certPEM], { type: 'application/x-pem-file' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mock-server.crt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Live log polling
  useEffect(() => {
    if (!liveLog) return
    const id = setInterval(loadRequests, 2000)
    return () => clearInterval(id)
  }, [liveLog, loadRequests])

  async function saveEndpoint(data: Partial<MockEndpoint>) {
    setError('')
    const isEdit = !!editing?.id
    const url = isEdit ? `/api/v2/mock-endpoints/${editing!.id}` : '/api/v2/mock-endpoints'
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setEditorOpen(false)
      loadEndpoints()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function deleteEndpoint(id: string) {
    await fetch(`/api/v2/mock-endpoints/${id}`, { method: 'DELETE' })
    loadEndpoints()
  }

  async function saveCert() {
    setCertError(''); setCertSuccess(''); setCertSaving(true)
    try {
      const body = certMode === 'custom'
        ? { mode: 'custom', cert_pem: customCertPEM, key_pem: customKeyPEM }
        : { mode: 'auto' }
      const res = await fetch('/api/v2/mock-server/cert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { cert_info?: CertInfo; error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      if (data.cert_info) setCertInfo(data.cert_info)
      // Refresh cert PEM for download
      const info = await fetch('/api/v2/mock-server/info').then(r => r.json()) as { cert_pem: string }
      if (info.cert_pem) setCertPEM(info.cert_pem)
      setCertSuccess(certMode === 'custom' ? 'Custom certificate applied — new connections use it immediately.' : 'Reverted to auto-generated certificate.')
    } catch (e) {
      setCertError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setCertSaving(false)
    }
  }

  async function clearLog() {
    await fetch('/api/v2/mock-requests', { method: 'DELETE' })
    setRequests([])
  }

  async function resetHits() {
    await fetch('/api/v2/mock-endpoints/reset-hits', { method: 'POST' })
    loadEndpoints()
  }

  const newRequests = requests.length - prevCountRef.current

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>

      <EndpointEditor open={editorOpen} ep={editing} onSave={saveEndpoint} onClose={() => setEditorOpen(false)} />
      <RequestDetail req={detail} onClose={() => setDetail(null)} />

      {/* Base URL info */}
      <Card header={<CardHeader titleText="Mock Server" subtitleText="Dedicated HTTPS listener — direct connection, no portal proxy" />}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '0.2rem' }}>BASE URL</div>
            <code style={{ fontSize: '0.9rem', background: 'var(--sapGroup_ContentBackground)', padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid var(--sapList_BorderColor)' }}>
              {mockBaseUrl(tlsPort)}
            </code>
          </div>
          <MessageStrip design="Information" hideCloseButton>
            Point your iFlow HTTP receiver adapter at <strong>{mockBaseUrl(tlsPort)}/your-path</strong>.
            The certificate is self-signed — import it into your trust store or Cloud Connector backend certificate list before connecting.
          </MessageStrip>
        </div>
      </Card>

      {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

      {/* Certificate */}
      <Card header={<CardHeader titleText="TLS Certificate" subtitleText="Controls which certificate the mock server presents to callers" />}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Mode toggle */}
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label style={{ width: '4rem', flexShrink: 0 }}>Mode</Label>
            {(['auto', 'custom'] as const).map(m => (
              <button key={m} onClick={() => { setCertMode(m); setCertError(''); setCertSuccess('') }} style={{
                padding: '0.3rem 1rem', border: '1px solid var(--sapButton_BorderColor)', borderRadius: '0.25rem', cursor: 'pointer',
                background: certMode === m ? 'var(--sapButton_Emphasized_Background)' : 'var(--sapButton_Background)',
                color: certMode === m ? 'var(--sapButton_Emphasized_TextColor)' : 'var(--sapButton_TextColor)',
                fontSize: '0.875rem',
              }}>
                {m === 'auto' ? 'Auto-generated' : 'Custom / CA-signed'}
              </button>
            ))}
          </FlexBox>

          {/* Current cert info */}
          {certInfo && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {[
                { label: 'Subject',    value: certInfo.subject },
                { label: 'Issuer',     value: certInfo.self_signed ? `${certInfo.issuer} (self-signed)` : certInfo.issuer },
                { label: 'Valid from', value: new Date(certInfo.not_before).toLocaleDateString() },
                { label: 'Expires',    value: new Date(certInfo.not_after).toLocaleDateString(), warn: new Date(certInfo.not_after) < new Date(Date.now() + 30*24*3600*1000) },
                { label: 'SHA-256',    value: certInfo.fingerprint, mono: true },
              ].map(({ label, value, warn, mono }) => (
                <div key={label} style={{ background: 'var(--sapGroup_ContentBackground)', border: '1px solid var(--sapList_BorderColor)', borderRadius: '0.25rem', padding: '0.4rem 0.6rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', marginBottom: '0.15rem' }}>{label}</div>
                  <div style={{ fontSize: mono ? '0.7rem' : '0.8rem', fontFamily: mono ? 'monospace' : undefined, color: warn ? 'var(--sapNegativeColor)' : 'var(--sapTextColor)', wordBreak: 'break-all' }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Auto mode: just download */}
          {certMode === 'auto' && (
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <Button icon="download" disabled={!certPEM} onClick={downloadCert}>Download Certificate (.crt)</Button>
              <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                Import this into Cloud Connector's backend certificate trust list before connecting.
              </span>
            </FlexBox>
          )}

          {/* Custom mode: paste cert + key */}
          {certMode === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <MessageStrip design="Information" hideCloseButton>
                Paste your CA-signed certificate chain and private key below. The key is stored in the local database — use this only in a trusted local environment.
              </MessageStrip>
              <FlexBox alignItems={FlexBoxAlignItems.Start} style={{ gap: '0.75rem' }}>
                <Label style={{ width: '5rem', flexShrink: 0, marginTop: '0.4rem' }}>Certificate</Label>
                <TextArea
                  value={customCertPEM}
                  onInput={e => setCustomCertPEM((e.target as unknown as HTMLTextAreaElement).value)}
                  rows={6}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}
                  placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
                />
              </FlexBox>
              <FlexBox alignItems={FlexBoxAlignItems.Start} style={{ gap: '0.75rem' }}>
                <Label style={{ width: '5rem', flexShrink: 0, marginTop: '0.4rem' }}>Private Key</Label>
                <TextArea
                  value={customKeyPEM}
                  onInput={e => setCustomKeyPEM((e.target as unknown as HTMLTextAreaElement).value)}
                  rows={6}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}
                  placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
                />
              </FlexBox>
            </div>
          )}

          {certError   && <MessageStrip design="Negative"     hideCloseButton>{certError}</MessageStrip>}
          {certSuccess && <MessageStrip design="Positive"     hideCloseButton>{certSuccess}</MessageStrip>}

          <FlexBox style={{ gap: '0.5rem' }}>
            <Button design="Emphasized" disabled={certSaving || (certMode === 'custom' && (!customCertPEM.trim() || !customKeyPEM.trim()))} onClick={saveCert}>
              {certSaving ? 'Applying…' : certMode === 'auto' ? 'Regenerate & Apply' : 'Apply Custom Certificate'}
            </Button>
            {certMode === 'auto' && (
              <Button icon="download" disabled={!certPEM} onClick={downloadCert}>Download (.crt)</Button>
            )}
          </FlexBox>

        </div>
      </Card>

      {/* Endpoints */}
      <Card header={
        <CardHeader
          titleText="Mock Endpoints"
          subtitleText="Define paths that CPI iFlows can call — first matching enabled endpoint wins"
          action={
            <FlexBox style={{ gap: '0.5rem' }}>
              <Button design="Transparent" icon="reset" onClick={resetHits}>Reset hits</Button>
              <Button icon="add" design="Transparent" onClick={() => { setEditing(null); setEditorOpen(true) }}>Add Endpoint</Button>
            </FlexBox>
          }
        />
      }>
        <div style={{ padding: '0 1rem 1rem' }}>
          {endpoints.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
              No endpoints configured. Add one to start mocking.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '4.5rem 1fr 4rem 5rem 4rem 6rem', gap: '0 0.75rem', padding: '0.4rem 0.5rem', borderBottom: '2px solid var(--sapList_BorderColor)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>
                <span>Method</span><span>Path</span><span>Status</span><span>Latency</span><span>Hits</span><span></span>
              </div>
              {endpoints.map(ep => (
                <div key={ep.id} style={{ display: 'grid', gridTemplateColumns: '4.5rem 1fr 4rem 5rem 4rem 6rem', gap: '0 0.75rem', padding: '0.55rem 0.5rem', borderBottom: '1px solid var(--sapList_BorderColor)', alignItems: 'center', opacity: ep.enabled ? 1 : 0.5 }}>
                  {methodBadge(ep.method)}
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--sapTextColor)' }}>{ep.path_pattern}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>{ep.name}</div>
                  </div>
                  <span style={{ fontSize: '0.875rem' }}>{ep.response_status}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>{ep.latency_ms > 0 ? `${ep.latency_ms}ms` : '—'}</span>
                  <span style={{ fontSize: '0.875rem' }}>{ep.hit_count}</span>
                  <FlexBox style={{ gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <Button design="Transparent" icon="edit" onClick={() => { setEditing(ep); setEditorOpen(true) }} />
                    <Button design="Transparent" icon="delete" onClick={() => deleteEndpoint(ep.id)} />
                  </FlexBox>
                </div>
              ))}
            </>
          )}
        </div>
      </Card>

      {/* Request Log */}
      <Card header={
        <CardHeader
          titleText={`Request Log${newRequests > 0 && liveLog ? ` (+${newRequests} new)` : ''}`}
          subtitleText="Last 200 inbound calls — click a row for full detail"
          action={
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <CheckBox
                text="Live"
                checked={liveLog}
                onChange={e => setLiveLog((e.target as unknown as HTMLInputElement).checked)}
              />
              <Button design="Transparent" icon="delete" onClick={clearLog}>Clear</Button>
              <Button design="Transparent" icon="refresh" onClick={loadRequests}>Refresh</Button>
            </FlexBox>
          }
        />
      }>
        <div style={{ padding: '0 1rem 1rem' }}>
          {requests.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
              No requests received yet. CPI calls to <strong>{mockBaseUrl(tlsPort)}/…</strong> will appear here.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '4.5rem 1fr 4rem 5rem 5rem', gap: '0 0.75rem', padding: '0.4rem 0.5rem', borderBottom: '2px solid var(--sapList_BorderColor)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>
                <span>Method</span><span>Path</span><span>Status</span><span>Matched</span><span>Time</span>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {requests.map(req => (
                  <div
                    key={req.id}
                    onClick={() => setDetail(req)}
                    style={{ display: 'grid', gridTemplateColumns: '4.5rem 1fr 4rem 5rem 5rem', gap: '0 0.75rem', padding: '0.5rem 0.5rem', borderBottom: '1px solid var(--sapList_BorderColor)', cursor: 'pointer', alignItems: 'center' }}
                  >
                    {methodBadge(req.method)}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.path}</span>
                    {statusBadge(req.response_status, req.matched)}
                    <span style={{ fontSize: '0.8rem', color: req.matched ? 'var(--sapPositiveColor)' : 'var(--sapNegativeColor)', fontWeight: 600 }}>
                      {req.matched ? '✓ yes' : '✗ no'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>{fmtTime(req.received_at)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

    </div>
  )
}
