import { useState, useRef } from 'react'
import {
  Button, Card, Select, Option, Input,
  FlexBox, FlexBoxAlignItems, FlexBoxJustifyContent,
  Label, MessageStrip, BusyIndicator,
} from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import { useClipboard, clipboardName } from '../context/WorkspaceContext'
import AssetBrowser from '../components/AssetBrowser'
import SaveAssetDialog from '../components/SaveAssetDialog'

// ── types ─────────────────────────────────────────────────────────────────────

interface HeaderRow { key: string; value: string }

interface ProxyResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  durationMs: number
}

// ── helpers ───────────────────────────────────────────────────────────────────

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const NO_BODY  = ['GET', 'HEAD', 'OPTIONS']

function tryPrettyPrint(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
}

function statusColor(s: number): string {
  if (s >= 500) return 'var(--sapNegativeColor)'
  if (s >= 400) return 'var(--sapCriticalColor)'
  if (s >= 300) return 'var(--sapInformativeColor)'
  return 'var(--sapPositiveColor)'
}

function urlWarnings(url: string): string[] {
  const w: string[] = []
  if (url !== url.trim())            w.push('URL has leading/trailing whitespace — will be trimmed on send')
  if (/\s/.test(url.trim()))         w.push('URL contains internal whitespace')
  if (/([^:])\/\//.test(url.trim())) w.push('URL contains double slashes in the path')
  return w
}

// Parse headers from an asset: JSON object or key:value lines
function headersFromContent(content: string): HeaderRow[] {
  try {
    const j = JSON.parse(content)
    // full request asset
    if (j.headers && typeof j.headers === 'object') {
      return Object.entries(j.headers as Record<string, string>).map(([k, v]) => ({ key: k, value: v }))
    }
    // plain JSON object of headers
    if (typeof j === 'object' && !Array.isArray(j)) {
      return Object.entries(j as Record<string, string>).map(([k, v]) => ({ key: k, value: String(v) }))
    }
  } catch { /* fall through */ }
  // key:value lines
  return content.split('\n')
    .filter(l => l.includes(':'))
    .map(l => { const i = l.indexOf(':'); return { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } })
    .filter(r => r.key)
}

// ── HeadersEditor ─────────────────────────────────────────────────────────────

function HeadersEditor({ headers, onChange }: { headers: HeaderRow[]; onChange: (h: HeaderRow[]) => void }) {
  function update(idx: number, field: 'key' | 'value', val: string) {
    const updated = headers.map((h, i) => i === idx ? { ...h, [field]: val } : h)
    const last = updated[updated.length - 1]
    if (last.key || last.value) updated.push({ key: '', value: '' })
    onChange(updated)
  }

  function remove(idx: number) {
    const updated = headers.filter((_, i) => i !== idx)
    if (updated.length === 0) updated.push({ key: '', value: '' })
    onChange(updated)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {headers.map((h, i) => (
        <FlexBox key={i} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.4rem' }}>
          <Input value={h.key}   placeholder="Header name" style={{ flex: 1 }}
            onInput={e => update(i, 'key',   (e.target as unknown as InputDomRef).value ?? '')} />
          <Input value={h.value} placeholder="Value"       style={{ flex: 1 }}
            onInput={e => update(i, 'value', (e.target as unknown as InputDomRef).value ?? '')} />
          {headers.length > 1 && (
            <Button icon="decline" design="Transparent" onClick={() => remove(i)} />
          )}
        </FlexBox>
      ))}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function HttpClient() {
  const [method,   setMethod]   = useState('GET')
  const [url,      setUrl]      = useState('')
  const [headers,  setHeaders]  = useState<HeaderRow[]>([{ key: '', value: '' }])
  const [body,     setBody]     = useState('')
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [response, setResponse] = useState<ProxyResponse | null>(null)

  // asset / clipboard dialog state
  const [reqBrowserOpen,  setReqBrowserOpen]  = useState(false)
  const [reqSaveOpen,     setReqSaveOpen]     = useState(false)
  const [hdrBrowserOpen,  setHdrBrowserOpen]  = useState(false)
  const [hdrSaveOpen,     setHdrSaveOpen]     = useState(false)
  const [hdrSent,         setHdrSent]         = useState(false)
  const [bodyBrowserOpen, setBodyBrowserOpen] = useState(false)
  const [bodySaveOpen,    setBodySaveOpen]    = useState(false)
  const [bodySent,        setBodySent]        = useState(false)
  const [respSaveOpen,    setRespSaveOpen]    = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const { clipboard, pushClipboard } = useClipboard()

  const noBody = NO_BODY.includes(method)
  const warnings = urlWarnings(url)

  // request serialised as a saveable asset
  function requestAsJson(): string {
    const hdrs: Record<string, string> = {}
    headers.forEach(({ key, value }) => { if (key.trim()) hdrs[key.trim()] = value })
    return JSON.stringify({ method, url, headers: hdrs, body: noBody ? '' : body }, null, 2)
  }

  function headersAsText(): string {
    return headers.filter(h => h.key.trim()).map(h => `${h.key}: ${h.value}`).join('\n')
  }

  function loadRequestFromContent(content: string) {
    try {
      const p = JSON.parse(content)
      if (p.method) setMethod(p.method)
      if (p.url)    setUrl(p.url)
      if (p.headers && typeof p.headers === 'object') {
        const rows: HeaderRow[] = Object.entries(p.headers as Record<string, string>)
          .map(([k, v]) => ({ key: k, value: v }))
        setHeaders([...rows, { key: '', value: '' }])
      }
      if (p.body !== undefined) setBody(p.body)
    } catch { /* not a request asset — ignore */ }
  }

  async function send() {
    const cleanUrl = url.trim()
    if (!cleanUrl) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setBusy(true); setError(''); setResponse(null)
    try {
      const hdrs: Record<string, string> = {}
      headers.forEach(({ key, value }) => { if (key.trim()) hdrs[key.trim()] = value })
      const res = await fetch('/api/v2/http-client/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, url: cleanUrl, headers: hdrs, body: noBody ? '' : body }),
        signal: ctrl.signal,
      })
      const data = await res.json() as { error?: string } & ProxyResponse
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResponse(data)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>

      {/* ── URL card ─────────────────────────────────────────────────────── */}
      <Card>
        <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Select style={{ width: '115px', flexShrink: 0 }}
              onChange={e => setMethod((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
              {METHODS.map(m => <Option key={m} value={m} selected={m === method}>{m}</Option>)}
            </Select>
            <Input value={url} placeholder="https://…" style={{ flex: 1 }}
              onInput={e => setUrl((e.target as unknown as InputDomRef).value ?? '')}
              onKeyDown={e => { if (e.key === 'Enter' && !busy) send() }} />
            <BusyIndicator active={busy} style={{ flexShrink: 0 }}>
              <Button design="Emphasized" disabled={!url.trim() || busy} onClick={send}>Send</Button>
            </BusyIndicator>
            {busy && <Button design="Transparent" onClick={() => abortRef.current?.abort()}>Cancel</Button>}
          </FlexBox>

          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.25rem' }}>
            <Button design="Transparent" onClick={() => { setReqBrowserOpen(true) }}>Load request</Button>
            <Button design="Transparent" onClick={() => setReqSaveOpen(true)}>Save request</Button>
          </FlexBox>

          {warnings.map((w, i) => (
            <MessageStrip key={i} design="Critical" hideCloseButton style={{ fontSize: '0.8rem' }}>{w}</MessageStrip>
          ))}
          {error && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}
        </div>
      </Card>

      {/* ── Headers + Body card ──────────────────────────────────────────── */}
      <Card>
        <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* Headers */}
          <div>
            <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
              style={{ marginBottom: '0.375rem' }}>
              <Label style={{ fontWeight: 600 }}>Headers</Label>
              <FlexBox style={{ gap: '0.25rem' }}>
                <Button design="Transparent" icon="open-folder" onClick={() => setHdrBrowserOpen(true)}>Load asset</Button>
                <Button design="Transparent" icon="save" onClick={() => setHdrSaveOpen(true)}>Save asset</Button>
                <Button design="Transparent" icon="paste" disabled={clipboard.length === 0}
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(clipboard[0].content) as Record<string, string>
                      setHeaders(Object.entries(parsed).map(([key, value]) => ({ key, value })))
                    } catch {
                      const lines = clipboard[0].content.split('\n')
                        .map(l => { const i = l.indexOf(':'); return i > 0 ? { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null })
                        .filter(Boolean) as { key: string; value: string }[]
                      if (lines.length) setHeaders(lines)
                    }
                  }}>
                  Paste clipboard
                </Button>
                <Button design="Transparent" icon={hdrSent ? 'accept' : 'copy'} disabled={!headersAsText()}
                  onClick={() => {
                    pushClipboard({ name: clipboardName('Headers'), content: headersAsText(), source: 'HTTP Client' })
                    setHdrSent(true); setTimeout(() => setHdrSent(false), 1800)
                  }}>
                  {hdrSent ? 'Sent!' : 'Copy clipboard'}
                </Button>
              </FlexBox>
            </FlexBox>
            <HeadersEditor headers={headers} onChange={setHeaders} />
          </div>

          {/* Body */}
          <div>
            <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
              style={{ marginBottom: '0.375rem' }}>
              <Label style={{ fontWeight: 600 }}>Body</Label>
              {!noBody && (
                <FlexBox style={{ gap: '0.25rem' }}>
                  <Button design="Transparent" icon="open-folder" onClick={() => setBodyBrowserOpen(true)}>Load asset</Button>
                  <Button design="Transparent" icon="save" disabled={!body.trim()} onClick={() => setBodySaveOpen(true)}>Save asset</Button>
                  <Button design="Transparent" icon="paste" disabled={clipboard.length === 0}
                    onClick={() => setBody(clipboard[0].content)}>
                    Paste clipboard
                  </Button>
                  <Button design="Transparent" icon={bodySent ? 'accept' : 'copy'} disabled={!body.trim()}
                    onClick={() => {
                      pushClipboard({ name: clipboardName('Request body'), content: body, source: 'HTTP Client' })
                      setBodySent(true); setTimeout(() => setBodySent(false), 1800)
                    }}>
                    {bodySent ? 'Sent!' : 'Copy clipboard'}
                  </Button>
                </FlexBox>
              )}
            </FlexBox>
            {noBody ? (
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>
                {method} requests do not have a body
              </span>
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)}
                placeholder="Request body (JSON, XML, plain text…)" rows={12}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontFamily: 'monospace', fontSize: '0.82rem',
                  background: 'var(--sapNeutralBackground)',
                  border: '1px solid var(--sapList_BorderColor)',
                  borderRadius: '4px', padding: '0.5rem',
                  color: 'var(--sapTextColor)', resize: 'vertical',
                }} />
            )}
          </div>
        </div>
      </Card>

      {/* ── Response card ────────────────────────────────────────────────── */}
      {response && (
        <Card>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Status line */}
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace', color: statusColor(response.status) }}>
                {response.status}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' }}>
                {response.statusText}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginLeft: 'auto' }}>
                {response.durationMs} ms · {response.body.length.toLocaleString()} bytes
              </span>
            </FlexBox>

            {/* Response headers */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Headers
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', background: 'var(--sapNeutralBackground)', padding: '0.5rem 0.75rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>{k}:</span>
                    <span style={{ color: 'var(--sapTextColor)', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Response body */}
            <div>
              <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
                style={{ marginBottom: '0.35rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Body
                </div>
                <FlexBox style={{ gap: '0.25rem' }}>
                  {response.body && (
                    <Button design="Transparent" icon="copy"
                      onClick={() => pushClipboard({ name: clipboardName(`HTTP ${response.status}`), content: response.body, source: 'HTTP Client' })}>
                      Clipboard
                    </Button>
                  )}
                  {response.body && (
                    <Button design="Transparent" onClick={() => setRespSaveOpen(true)}>Save as asset</Button>
                  )}
                </FlexBox>
              </FlexBox>
              <pre style={{ fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--sapNeutralBackground)', padding: '0.75rem', borderRadius: '4px', margin: 0 }}>
                {response.body
                  ? tryPrettyPrint(response.body)
                  : <span style={{ color: 'var(--sapContent_LabelColor)' }}>(empty body)</span>
                }
              </pre>
            </div>

          </div>
        </Card>
      )}

      {/* ── dialogs ──────────────────────────────────────────────────────── */}
      <AssetBrowser open={reqBrowserOpen} onClose={() => setReqBrowserOpen(false)}
        filterType="request" title="Load Request"
        onSelect={(content) => { loadRequestFromContent(content); setReqBrowserOpen(false) }} />

      <SaveAssetDialog open={reqSaveOpen} content={requestAsJson()}
        defaultType="request" defaultName={clipboardName('Request')}
        onClose={() => setReqSaveOpen(false)} />

      <AssetBrowser open={hdrBrowserOpen} onClose={() => setHdrBrowserOpen(false)}
        title="Load Headers"
        onSelect={(content) => {
          const rows = headersFromContent(content)
          if (rows.length) {
            setHeaders(prev => {
              const existing = prev.filter(h => h.key.trim() || h.value.trim())
              return [...existing, ...rows, { key: '', value: '' }]
            })
          }
          setHdrBrowserOpen(false)
        }} />

      <SaveAssetDialog open={hdrSaveOpen} content={headersAsText()}
        defaultType="snippet" defaultName={clipboardName('Headers')}
        onClose={() => setHdrSaveOpen(false)} onSaved={() => setHdrSaveOpen(false)} />

      <AssetBrowser open={bodyBrowserOpen} onClose={() => setBodyBrowserOpen(false)}
        title="Load Asset into Body"
        onSelect={(content) => { setBody(content); setBodyBrowserOpen(false) }} />

      <SaveAssetDialog open={bodySaveOpen} content={body}
        defaultType="payload" defaultName={clipboardName('Request body')}
        onClose={() => setBodySaveOpen(false)} onSaved={() => setBodySaveOpen(false)} />

      {response && (
        <SaveAssetDialog open={respSaveOpen} content={response.body}
          defaultType="payload" defaultName={clipboardName(`HTTP ${response.status}`)}
          onClose={() => setRespSaveOpen(false)} />
      )}
    </div>
  )
}
