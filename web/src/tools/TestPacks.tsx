import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxAlignItems,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  TextArea,
  BusyIndicator,
} from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import { useWorkspace } from '../context/WorkspaceContext'
import SaveAssetDialog from '../components/SaveAssetDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestPack {
  id: string
  project_id: string | null
  name: string
  description: string
  case_count: number
  created_by: string
  created_at: string
  updated_at: string
}

interface TestCase {
  id: string
  pack_id: string
  seq: number
  name: string
  type: 'http' | 'sftp'
  method: string
  url: string
  headers: Record<string, string>
  body: string
  expected_status: number | null
  expected_body_contains: string | null
  sftp_source: string
  sftp_target: string
  wait_seconds: number
}

interface CaseResult {
  case_id: string
  name: string
  status: 'pass' | 'fail' | 'error'
  status_code: number
  duration_ms: number
  waited_seconds?: number
  body_preview: string
  error?: string
}

interface RunResult {
  pack_id: string
  total: number
  passed: number
  failed: number
  duration_ms: number
  cases: CaseResult[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

function inp(e: { target: unknown }) {
  return (e.target as unknown as InputDomRef).value ?? ''
}

function sel(e: { detail: { selectedOption: { value?: string } } }) {
  return e.detail.selectedOption.value ?? ''
}

function relTime(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

function headersToText(h: Record<string, string>): string {
  return Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n')
}

function textToHeaders(t: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of t.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'pass' | 'fail' | 'error' }) {
  const colours = { pass: '#107e3e', fail: '#bb0000', error: '#e76500' }
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem',
      borderRadius: '0.75rem', color: '#fff', whiteSpace: 'nowrap',
      background: colours[status],
    }}>
      {status.toUpperCase()}
    </span>
  )
}

// ── Case editor row ───────────────────────────────────────────────────────────

interface CaseEditorProps {
  tc: TestCase
  index: number
  onSave: (updated: TestCase) => Promise<void>
  onDelete: () => Promise<void>
}

function CaseEditor({ tc, index, onSave, onDelete }: CaseEditorProps) {
  const [expanded,    setExpanded]    = useState(false)
  const [name,        setName]        = useState(tc.name)
  const [type,        setType]        = useState<'http' | 'sftp'>(tc.type ?? 'http')
  const [method,      setMethod]      = useState(tc.method)
  const [url,         setUrl]         = useState(tc.url)
  const [headersText, setHeadersText] = useState(headersToText(tc.headers ?? {}))
  const [body,        setBody]        = useState(tc.body)
  const [expStatus,   setExpStatus]   = useState(tc.expected_status?.toString() ?? '')
  const [expBody,     setExpBody]     = useState(tc.expected_body_contains ?? '')
  const [sftpSource,   setSftpSource]  = useState(tc.sftp_source ?? '')
  const [sftpTarget,   setSftpTarget]  = useState(tc.sftp_target ?? '')
  const [waitSeconds,  setWaitSeconds] = useState(tc.wait_seconds?.toString() ?? '0')
  const [saving,       setSaving]      = useState(false)
  const [dirty,        setDirty]       = useState(false)

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true) }
  }

  async function save() {
    setSaving(true)
    await onSave({
      ...tc, name, type, method, url,
      headers: textToHeaders(headersText),
      body,
      expected_status: expStatus ? parseInt(expStatus, 10) : null,
      expected_body_contains: expBody.trim() || null,
      sftp_source: sftpSource.trim(),
      sftp_target: sftpTarget.trim(),
      wait_seconds: parseInt(waitSeconds, 10) || 0,
    })
    setSaving(false); setDirty(false)
  }

  const statusColor = { GET: '#0070f2', POST: '#107e3e', PUT: '#e76500', PATCH: '#c0399f', DELETE: '#bb0000', HEAD: '#888' }

  const badge = type === 'sftp'
    ? <span style={{ fontSize: '0.7rem', fontWeight: 700, minWidth: '3.5rem', textAlign: 'center', padding: '0.1rem 0.35rem', borderRadius: '3px', color: '#fff', background: '#6c00a4' }}>SFTP</span>
    : <span style={{ fontSize: '0.7rem', fontWeight: 700, minWidth: '3.5rem', textAlign: 'center', padding: '0.1rem 0.35rem', borderRadius: '3px', color: '#fff', background: statusColor[method as keyof typeof statusColor] ?? '#888' }}>{method}</span>

  const preview = type === 'sftp'
    ? (sftpSource ? `${sftpSource} → ${sftpTarget || '(target)'}` : '(no path)')
    : url

  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 0.75rem', background: 'var(--sapList_Background)',
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--sapContent_LabelColor)', minWidth: '1.25rem' }}>
          {index + 1}
        </span>
        {badge}
        <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name || '(unnamed)'}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
          {preview}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--sapGroup_ContentBackground)', display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--sapList_BorderColor)' }}>

          {/* Name + type */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
            <Label>Name</Label>
            <Input value={name} style={{ width: '100%' }} onInput={e => mark(setName)(inp(e))} />
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {(['http', 'sftp'] as const).map(t => (
                <button key={t} onClick={() => mark(setType)(t)} style={{
                  padding: '0.25rem 0.75rem', border: '1px solid var(--sapList_BorderColor)',
                  borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--sapFontFamily)',
                  fontSize: '0.78rem', fontWeight: type === t ? 700 : 400,
                  background: type === t ? (t === 'sftp' ? '#6c00a4' : 'var(--sapHighlightColor)') : 'var(--sapNeutralBackground)',
                  color: type === t ? '#fff' : 'var(--sapTextColor)',
                }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* HTTP fields */}
          {type === 'http' && (<>
            <div style={{ display: 'grid', gridTemplateColumns: '120px auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
              <Label>URL</Label>
              <Select style={{ minWidth: '90px' }} onChange={e => mark(setMethod)(sel(e))}>
                {METHODS.map(m => <Option key={m} value={m} selected={m === method}>{m}</Option>)}
              </Select>
              <Input value={url} placeholder="https://…" style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
                onInput={e => mark(setUrl)(inp(e))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', alignItems: 'start' }}>
              <Label style={{ paddingTop: '0.25rem' }}>Headers</Label>
              <TextArea value={headersText} rows={3} placeholder="Content-Type: application/json"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem' }}
                onInput={e => mark(setHeadersText)((e.target as unknown as HTMLTextAreaElement).value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', alignItems: 'start' }}>
              <Label style={{ paddingTop: '0.25rem' }}>Body</Label>
              <TextArea value={body} rows={4} placeholder="Request body (JSON, XML…)"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem' }}
                onInput={e => mark(setBody)((e.target as unknown as HTMLTextAreaElement).value)} />
            </div>
            <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', paddingTop: '0.75rem' }}>
              <Label style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', display: 'block', marginBottom: '0.5rem' }}>
                ASSERTIONS — leave blank to accept any 2xx response
              </Label>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 1fr', gap: '0.5rem', alignItems: 'center' }}>
                <Label>Expected status</Label>
                <Input value={expStatus} placeholder="e.g. 200" type="Number" style={{ width: '100%' }}
                  onInput={e => mark(setExpStatus)(inp(e))} />
                <Label>Body contains</Label>
                <Input value={expBody} placeholder='e.g. "success"' style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => mark(setExpBody)(inp(e))} />
              </div>
            </div>
          </>)}

          {/* SFTP fields */}
          {type === 'sftp' && (<>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', alignItems: 'center' }}>
              <Label>Source file</Label>
              <Input value={sftpSource} placeholder="/testdata/orders/PO_001.xml"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
                onInput={e => mark(setSftpSource)(inp(e))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', alignItems: 'center' }}>
              <Label>Deposit folder</Label>
              <Input value={sftpTarget} placeholder="/inbox/orders/"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
                onInput={e => mark(setSftpTarget)(inp(e))} />
            </div>
            <MessageStrip design="Information" hideCloseButton>
              Source file path is relative to the SFTP data root. Convention: place test files under <strong>/testdata/</strong> and target the folder your iFlow polls (e.g. <strong>/inbox/orders/</strong>). The file keeps its original name on deposit.
            </MessageStrip>
          </>)}

          {/* Wait */}
          <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', paddingTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Label style={{ minWidth: '120px' }}>Wait after step</Label>
            <Input value={waitSeconds} type="Number" style={{ width: '80px' }}
              onInput={e => mark(setWaitSeconds)(inp(e))} />
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.82rem', color: 'var(--sapContent_LabelColor)' }}>
              seconds &nbsp;{parseInt(waitSeconds, 10) === 0 ? '(no wait)' : ''}
            </span>
          </div>

          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Button design="Emphasized" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button design="Transparent" disabled={saving} onClick={() => onDelete()}>Delete</Button>
            {!dirty && <span style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>Saved</span>}
          </FlexBox>
        </div>
      )}
    </div>
  )
}

// ── Run results panel ─────────────────────────────────────────────────────────

function RunResults({ result, onClose }: { result: RunResult; onClose: () => void }) {
  const allPass = result.failed === 0

  return (
    <Card header={
      <CardHeader
        titleText={allPass ? '✓ All tests passed' : `${result.failed} test${result.failed !== 1 ? 's' : ''} failed`}
        subtitleText={`${result.passed}/${result.total} passed · ${result.duration_ms}ms total`}
        action={<Button design="Transparent" onClick={onClose}>Dismiss</Button>}
      />
    }>
      <div style={{ padding: '0.5rem 0' }}>
        {result.cases.map((cr, i) => (
          <div key={cr.case_id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.5rem 1rem',
            borderBottom: i < result.cases.length - 1 ? '1px solid var(--sapList_BorderColor)' : 'none',
            background: cr.status !== 'pass' ? 'var(--sapErrorBackground)' : undefined,
          }}>
            <StatusBadge status={cr.status} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--sapTextColor)' }}>
                {cr.name}
              </div>
              {cr.error && (
                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--sapNegativeColor)', marginTop: '0.2rem' }}>
                  {cr.error}
                </div>
              )}
              {cr.body_preview && cr.status !== 'pass' && (
                <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginTop: '0.2rem', wordBreak: 'break-all' }}>
                  {cr.body_preview}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', flexShrink: 0 }}>
              {cr.status_code > 0 && (
                <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600, color: cr.status_code < 400 ? 'var(--sapPositiveColor)' : 'var(--sapNegativeColor)' }}>
                  HTTP {cr.status_code}
                </span>
              )}
              <span style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>{cr.duration_ms}ms</span>
              {cr.waited_seconds ? (
                <span style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>
                  +{cr.waited_seconds}s wait
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Pack detail ───────────────────────────────────────────────────────────────

function PackDetail({ packId, onBack }: { packId: string; onBack: () => void }) {
  const [pack,      setPack]      = useState<TestPack | null>(null)
  const [cases,     setCases]     = useState<TestCase[]>([])
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [result,    setResult]    = useState<RunResult | null>(null)
  const [error,     setError]     = useState('')
  const [editName,  setEditName]  = useState(false)
  const [packName,  setPackName]  = useState('')
  const [packDesc,  setPackDesc]  = useState('')
  const [saveResultOpen, setSaveResultOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v2/test-packs/${packId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { pack: TestPack; cases: TestCase[] }
      setPack(data.pack); setCases(data.cases)
      setPackName(data.pack.name); setPackDesc(data.pack.description)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [packId])

  useEffect(() => { load() }, [load])

  async function addCase(type: 'http' | 'sftp') {
    const name = type === 'sftp' ? 'New SFTP case' : 'New HTTP case'
    const wait = type === 'sftp' ? 60 : 5
    const res = await fetch(`/api/v2/test-packs/${packId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seq: cases.length, name, type, method: 'GET', url: '', headers: {}, body: '', sftp_source: '', sftp_target: '', wait_seconds: wait }),
    })
    if (res.ok) load()
  }

  async function saveCase(updated: TestCase) {
    await fetch(`/api/v2/test-packs/${packId}/cases/${updated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seq: updated.seq, name: updated.name, type: updated.type,
        method: updated.method, url: updated.url,
        headers: updated.headers, body: updated.body,
        expected_status: updated.expected_status,
        expected_body_contains: updated.expected_body_contains,
        sftp_source: updated.sftp_source,
        sftp_target: updated.sftp_target,
        wait_seconds: updated.wait_seconds,
      }),
    })
  }

  async function deleteCase(cid: string) {
    await fetch(`/api/v2/test-packs/${packId}/cases/${cid}`, { method: 'DELETE' })
    setCases(prev => prev.filter(c => c.id !== cid))
  }

  async function savePack() {
    await fetch(`/api/v2/test-packs/${packId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: packName, description: packDesc }),
    })
    setEditName(false)
    load()
  }

  async function run() {
    setRunning(true); setResult(null); setError('')
    try {
      const res = await fetch(`/api/v2/test-packs/${packId}/run`, { method: 'POST' })
      const data = await res.json() as RunResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  function resultAsText(): string {
    if (!result) return ''
    const lines = [`Test Pack Run: ${pack?.name}`, `${result.passed}/${result.total} passed · ${result.duration_ms}ms`, '']
    for (const cr of result.cases) {
      lines.push(`[${cr.status.toUpperCase()}] ${cr.name}`)
      if (cr.status_code) lines.push(`  HTTP ${cr.status_code} · ${cr.duration_ms}ms`)
      if (cr.error) lines.push(`  ${cr.error}`)
    }
    return lines.join('\n')
  }

  if (loading) return <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}><BusyIndicator active /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <Card header={
        <CardHeader
          titleText={pack?.name ?? ''}
          subtitleText={pack?.description || `${cases.length} test case${cases.length !== 1 ? 's' : ''}`}
          action={
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <Button design="Transparent" icon="edit" onClick={() => setEditName(e => !e)}>Edit</Button>
              <Button design="Transparent" icon="nav-back" onClick={onBack}>All packs</Button>
            </div>
          }
        />
      }>
        {editName && (
          <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', alignItems: 'center' }}>
              <Label>Name</Label>
              <Input value={packName} style={{ width: '100%' }} onInput={e => setPackName(inp(e))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', alignItems: 'center' }}>
              <Label>Description</Label>
              <Input value={packDesc} style={{ width: '100%' }} onInput={e => setPackDesc(inp(e))} />
            </div>
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
              <Button design="Emphasized" onClick={savePack}>Save</Button>
              <Button design="Transparent" onClick={() => setEditName(false)}>Cancel</Button>
            </FlexBox>
          </div>
        )}
      </Card>

      {error && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}

      {/* Cases */}
      <Card header={
        <CardHeader
          titleText="Test Cases"
          subtitleText={cases.length === 0 ? 'No cases yet' : `${cases.length} case${cases.length !== 1 ? 's' : ''} — click to expand and edit`}
          action={
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <Button design="Transparent" icon="add" onClick={() => addCase('http')}>Add HTTP</Button>
              <Button design="Transparent" icon="add" onClick={() => addCase('sftp')}>Add SFTP</Button>
              <Button design="Emphasized" icon="play" disabled={running || cases.length === 0} onClick={run}>
                {running ? 'Running…' : 'Run all'}
              </Button>
            </div>
          }
        />
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem 1rem' }}>
          {cases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', fontStyle: 'italic' }}>
              No test cases — use Add HTTP or Add SFTP above to get started
            </div>
          ) : cases.map((tc, i) => (
            <CaseEditor key={tc.id} tc={tc} index={i}
              onSave={saveCase}
              onDelete={() => deleteCase(tc.id)}
            />
          ))}
        </div>
      </Card>

      {/* Results */}
      {result && (
        <>
          <RunResults result={result} onClose={() => setResult(null)} />
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Button design="Transparent" icon="save" onClick={() => setSaveResultOpen(true)}>
              Save results as asset
            </Button>
          </FlexBox>
          <SaveAssetDialog open={saveResultOpen} content={resultAsText()} defaultType="snippet"
            defaultName={`${pack?.name ?? 'test'}-results`}
            onClose={() => setSaveResultOpen(false)} onSaved={() => setSaveResultOpen(false)} />
        </>
      )}
    </div>
  )
}

// ── Pack list ─────────────────────────────────────────────────────────────────

export default function TestPacks() {
  const { selectedProject } = useWorkspace()
  const [packs,       setPacks]       = useState<TestPack[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [creating,    setCreating]    = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newDesc,     setNewDesc]     = useState('')
  const [deleteId,    setDeleteId]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = selectedProject ? `?project_id=${selectedProject.id}` : ''
      const res = await fetch(`/api/v2/test-packs${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPacks(await res.json() as TestPack[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!newName.trim()) return
    const res = await fetch('/api/v2/test-packs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: selectedProject?.id ?? null,
        name: newName.trim(),
        description: newDesc.trim(),
      }),
    })
    if (res.ok) {
      const pack = await res.json() as TestPack
      setCreating(false); setNewName(''); setNewDesc('')
      setSelectedId(pack.id)
      load()
    }
  }

  async function deletePack(id: string) {
    await fetch(`/api/v2/test-packs/${id}`, { method: 'DELETE' })
    setDeleteId(null)
    setPacks(prev => prev.filter(p => p.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  if (selectedId) {
    return (
      <div style={{ padding: '1rem' }}>
        <PackDetail packId={selectedId} onBack={() => { setSelectedId(null); load() }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      <Card header={
        <CardHeader
          titleText="Test Packs"
          subtitleText={selectedProject ? `Showing packs for ${selectedProject.name}` : 'All packs — select a project to filter'}
          action={
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <Button design="Transparent" icon="refresh" onClick={load} />
              <Button design="Emphasized" icon="add" onClick={() => setCreating(true)}>New pack</Button>
            </div>
          }
        />
      }>
        {creating && (
          <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', alignItems: 'center' }}>
              <Label>Name *</Label>
              <Input value={newName} placeholder="e.g. Orders API smoke tests" style={{ width: '100%' }}
                onInput={e => setNewName(inp(e))}
                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') create() }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem', alignItems: 'center' }}>
              <Label>Description</Label>
              <Input value={newDesc} placeholder="Optional description" style={{ width: '100%' }} onInput={e => setNewDesc(inp(e))} />
            </div>
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', paddingLeft: '128px' }}>
              <Button design="Emphasized" disabled={!newName.trim()} onClick={create}>Create</Button>
              <Button design="Transparent" onClick={() => { setCreating(false); setNewName(''); setNewDesc('') }}>Cancel</Button>
            </FlexBox>
          </div>
        )}

        {error && <div style={{ padding: '0.5rem 1rem' }}><MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip></div>}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><BusyIndicator active /></div>
        ) : packs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', fontFamily: 'var(--sapFontFamily)', fontSize: '0.9rem', color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>
            No test packs yet — click New pack to create one
          </div>
        ) : (
          <>
            {/* List header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0.3rem 1rem', borderBottom: '2px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)' }}>
              <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>Name</span>
              <span style={{ width: '5rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', textAlign: 'center' }}>Cases</span>
              <span style={{ width: '6rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', textAlign: 'right' }}>Updated</span>
              <span style={{ width: '4rem' }} />
            </div>
            {packs.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', padding: '0.55rem 1rem',
                borderBottom: '1px solid var(--sapList_BorderColor)',
                cursor: 'pointer',
                background: deleteId === p.id ? 'var(--sapErrorBackground)' : undefined,
              }}
                onClick={() => deleteId === p.id ? undefined : setSelectedId(p.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                  {p.description && (
                    <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.description}
                    </div>
                  )}
                </div>
                <span style={{ width: '5rem', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.82rem', color: 'var(--sapContent_LabelColor)' }}>
                  {p.case_count}
                </span>
                <span style={{ width: '6rem', textAlign: 'right', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>
                  {relTime(p.updated_at)}
                </span>
                <div style={{ width: '4rem', display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  {deleteId === p.id ? (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <Button design="Negative" onClick={() => deletePack(p.id)} style={{ padding: '0 0.4rem', height: '1.75rem' }}>Delete</Button>
                      <Button design="Transparent" onClick={() => setDeleteId(null)} style={{ padding: '0 0.4rem', height: '1.75rem' }}>Cancel</Button>
                    </div>
                  ) : (
                    <Button design="Transparent" icon="delete" onClick={() => setDeleteId(p.id)}
                      style={{ padding: '0 0.4rem', height: '1.75rem', color: 'var(--sapNegativeColor)' }} />
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  )
}
