import { useState, useEffect, useCallback } from 'react'
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobConfig {
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: string
  pack_id?: string
  skip_waits?: boolean
}

interface ScheduledJob {
  id: string
  name: string
  type: string
  interval_seconds: number
  config: JobConfig
  enabled: boolean
  last_run_at: string | null
  last_status: string | null
  last_error: string | null
  created_at: string
  active_goroutine?: boolean
}

interface TestPack {
  id: string
  name: string
}

// ── Interval presets ──────────────────────────────────────────────────────────

const INTERVALS = [
  { label: 'Every 1 minute',   value: 60    },
  { label: 'Every 5 minutes',  value: 300   },
  { label: 'Every 15 minutes', value: 900   },
  { label: 'Every 30 minutes', value: 1800  },
  { label: 'Every 1 hour',     value: 3600  },
  { label: 'Every 6 hours',    value: 21600 },
  { label: 'Every 24 hours',   value: 86400 },
]

function intervalLabel(seconds: number) {
  const preset = INTERVALS.find(i => i.value === seconds)
  if (preset) return preset.label
  if (seconds < 3600) return `Every ${Math.round(seconds / 60)}m`
  return `Every ${Math.round(seconds / 3600)}h`
}

function statusColour(s: string | null) {
  if (s === 'pass') return 'var(--sapPositiveColor)'
  if (s === 'fail') return 'var(--sapNegativeColor)'
  if (s === 'error') return 'var(--sapWarningColor)'
  return 'var(--sapContent_LabelColor)'
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Editor Dialog ─────────────────────────────────────────────────────────────

interface EditorProps {
  open: boolean
  job: Partial<ScheduledJob> | null
  packs: TestPack[]
  onSave: (data: Partial<ScheduledJob>) => void
  onClose: () => void
}

function JobEditor({ open, job, packs, onSave, onClose }: EditorProps) {
  const [name, setName]           = useState('')
  const [type, setType]           = useState('http')
  const [interval, setInterval]   = useState(3600)
  const [enabled, setEnabled]     = useState(true)
  const [url, setUrl]             = useState('')
  const [method, setMethod]       = useState('POST')
  const [headersRaw, setHeaders]  = useState('')
  const [body, setBody]           = useState('')
  const [packId, setPackId]       = useState('')
  const [skipWaits, setSkipWaits] = useState(true)

  useEffect(() => {
    if (!open) return
    setName(job?.name ?? '')
    setType(job?.type ?? 'http')
    setInterval(job?.interval_seconds ?? 3600)
    setEnabled(job?.enabled ?? true)
    setUrl(job?.config?.url ?? '')
    setMethod(job?.config?.method ?? 'POST')
    setHeaders(job?.config?.headers ? Object.entries(job.config.headers).map(([k,v]) => `${k}: ${v}`).join('\n') : '')
    setBody(job?.config?.body ?? '')
    setPackId(job?.config?.pack_id ?? (packs[0]?.id ?? ''))
    setSkipWaits(job?.config?.skip_waits ?? true)
  }, [open, job, packs])

  function buildHeaders(): Record<string, string> {
    const out: Record<string, string> = {}
    headersRaw.split('\n').forEach(line => {
      const idx = line.indexOf(':')
      if (idx > 0) {
        out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
    })
    return out
  }

  function handleSave() {
    const config: JobConfig = type === 'test_pack'
      ? { pack_id: packId, skip_waits: skipWaits }
      : { url, method, headers: buildHeaders(), body }
    onSave({ name, type, interval_seconds: interval, config, enabled })
  }

  return (
    <Dialog
      open={open}
      headerText={job?.id ? 'Edit Scheduled Job' : 'New Scheduled Job'}
      style={{ width: '560px' }}
      footer={
        <FlexBox style={{ gap: '0.5rem', padding: '0.5rem' }}>
          <Button design="Emphasized" onClick={handleSave} disabled={!name.trim()}>Save</Button>
          <Button onClick={onClose}>Cancel</Button>
        </FlexBox>
      }
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>

        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0 }}>Name</Label>
          <Input value={name} onInput={e => setName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} placeholder="e.g. Hourly smoke test" />
        </FlexBox>

        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0 }}>Type</Label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['http', 'test_pack'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  padding: '0.3rem 0.9rem', border: '1px solid var(--sapButton_BorderColor)',
                  borderRadius: '0.25rem', cursor: 'pointer',
                  background: type === t ? 'var(--sapButton_Emphasized_Background)' : 'var(--sapButton_Background)',
                  color: type === t ? 'var(--sapButton_Emphasized_TextColor)' : 'var(--sapButton_TextColor)',
                  fontSize: '0.875rem',
                }}
              >
                {t === 'http' ? 'HTTP Request' : 'Test Pack'}
              </button>
            ))}
          </div>
        </FlexBox>

        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0 }}>Interval</Label>
          <Select onChange={e => setInterval(parseInt((e.target as unknown as HTMLSelectElement).value))} style={{ flex: 1 }}>
            {INTERVALS.map(i => (
              <Option key={i.value} value={String(i.value)} selected={i.value === interval}>{i.label}</Option>
            ))}
          </Select>
        </FlexBox>

        {type === 'http' ? (
          <>
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <Label style={{ width: '5rem', flexShrink: 0 }}>Method</Label>
              <Select onChange={e => setMethod((e.target as unknown as HTMLSelectElement).value)} style={{ width: '100px' }}>
                {['POST','GET','PUT','DELETE'].map(m => (
                  <Option key={m} value={m} selected={m === method}>{m}</Option>
                ))}
              </Select>
              <Input value={url} onInput={e => setUrl((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} placeholder="https://…" />
            </FlexBox>
            <FlexBox alignItems={FlexBoxAlignItems.Start} style={{ gap: '0.75rem' }}>
              <Label style={{ width: '5rem', flexShrink: 0, marginTop: '0.4rem' }}>Headers</Label>
              <TextArea value={headersRaw} onInput={e => setHeaders((e.target as unknown as HTMLTextAreaElement).value)} rows={3} style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }} placeholder={'Authorization: Bearer …\nContent-Type: application/xml'} />
            </FlexBox>
            <FlexBox alignItems={FlexBoxAlignItems.Start} style={{ gap: '0.75rem' }}>
              <Label style={{ width: '5rem', flexShrink: 0, marginTop: '0.4rem' }}>Body</Label>
              <TextArea value={body} onInput={e => setBody((e.target as unknown as HTMLTextAreaElement).value)} rows={4} style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }} placeholder="Request body…" />
            </FlexBox>
          </>
        ) : (
          <>
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <Label style={{ width: '5rem', flexShrink: 0 }}>Test Pack</Label>
              {packs.length === 0 ? (
                <span style={{ fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>No packs available</span>
              ) : (
                <Select onChange={e => setPackId((e.target as unknown as HTMLSelectElement).value)} style={{ flex: 1 }}>
                  {packs.map(p => <Option key={p.id} value={p.id} selected={p.id === packId}>{p.name}</Option>)}
                </Select>
              )}
            </FlexBox>
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <Label style={{ width: '5rem', flexShrink: 0 }}></Label>
              <CheckBox
                text="Skip wait delays"
                checked={skipWaits}
                onChange={e => setSkipWaits((e.target as unknown as HTMLInputElement).checked)}
              />
            </FlexBox>
          </>
        )}

        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
          <Label style={{ width: '5rem', flexShrink: 0 }}></Label>
          <CheckBox
            text="Enabled"
            checked={enabled}
            onChange={e => setEnabled((e.target as unknown as HTMLInputElement).checked)}
          />
        </FlexBox>

      </div>
    </Dialog>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Scheduler() {
  const [jobs, setJobs]           = useState<ScheduledJob[]>([])
  const [packs, setPacks]         = useState<TestPack[]>([])
  const [error, setError]         = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing]     = useState<Partial<ScheduledJob> | null>(null)
  const [triggering, setTriggering] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [jobsRes, packsRes] = await Promise.all([
        fetch('/api/v2/scheduled-jobs/status'),
        fetch('/api/v2/test-packs'),
      ])
      if (jobsRes.ok) setJobs(await jobsRes.json() as ScheduledJob[])
      if (packsRes.ok) setPacks(await packsRes.json() as TestPack[])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 10_000) // refresh every 10s for last_run updates
    return () => clearInterval(id)
  }, [load])

  function openNew() {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(job: ScheduledJob) {
    setEditing(job)
    setEditorOpen(true)
  }

  async function save(data: Partial<ScheduledJob>) {
    setError('')
    const isEdit = !!editing?.id
    const url = isEdit ? `/api/v2/scheduled-jobs/${editing!.id}` : '/api/v2/scheduled-jobs'
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setEditorOpen(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function deleteJob(id: string) {
    await fetch(`/api/v2/scheduled-jobs/${id}`, { method: 'DELETE' })
    load()
  }

  async function trigger(id: string) {
    setTriggering(id)
    await fetch(`/api/v2/scheduled-jobs/${id}/trigger`, { method: 'POST' })
    setTimeout(() => { setTriggering(null); load() }, 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>

      <JobEditor
        open={editorOpen}
        job={editing}
        packs={packs}
        onSave={save}
        onClose={() => setEditorOpen(false)}
      />

      <Card header={
        <CardHeader
          titleText="Scheduler"
          subtitleText="Recurring jobs — fire an HTTP request or run a test pack on a schedule"
          action={
            <Button icon="add" design="Transparent" onClick={openNew}>New Job</Button>
          }
        />
      }>
        <div style={{ padding: '0 1rem 1rem' }}>

          {error && (
            <MessageStrip design="Negative" style={{ marginBottom: '0.75rem' }} hideCloseButton>{error}</MessageStrip>
          )}

          {jobs.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
              No scheduled jobs yet — create one to get started.
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 7rem 8rem 6rem 5rem 8rem', gap: '0 0.75rem', padding: '0.4rem 0.5rem', borderBottom: '2px solid var(--sapList_BorderColor)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>
                <span>Name / Type</span>
                <span>Interval</span>
                <span>Last Run</span>
                <span>Status</span>
                <span>Active</span>
                <span></span>
              </div>

              {jobs.map(job => (
                <div key={job.id} style={{ display: 'grid', gridTemplateColumns: '1fr 7rem 8rem 6rem 5rem 8rem', gap: '0 0.75rem', padding: '0.6rem 0.5rem', borderBottom: '1px solid var(--sapList_BorderColor)', alignItems: 'center' }}>

                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: job.enabled ? 'var(--sapTextColor)' : 'var(--sapContent_LabelColor)' }}>
                      {job.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
                      {job.type === 'test_pack' ? `Test Pack` : `HTTP ${job.config.method ?? 'POST'}`}
                      {job.type === 'http' && job.config.url && (
                        <span style={{ marginLeft: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          — {job.config.url.length > 40 ? job.config.url.slice(0, 40) + '…' : job.config.url}
                        </span>
                      )}
                      {job.type === 'test_pack' && job.config.pack_id && (
                        <span style={{ marginLeft: '0.4rem' }}>
                          — {packs.find(p => p.id === job.config.pack_id)?.name ?? job.config.pack_id}
                        </span>
                      )}
                    </div>
                    {job.last_error && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--sapNegativeColor)', marginTop: '0.1rem' }}>{job.last_error}</div>
                    )}
                  </div>

                  <span style={{ fontSize: '0.8rem' }}>{intervalLabel(job.interval_seconds)}</span>

                  <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>{fmtTime(job.last_run_at)}</span>

                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: statusColour(job.last_status) }}>
                    {job.last_status ?? '—'}
                  </span>

                  <span style={{ fontSize: '0.8rem' }}>
                    {!job.enabled ? (
                      <span style={{ color: 'var(--sapContent_LabelColor)' }}>disabled</span>
                    ) : job.active_goroutine ? (
                      <span style={{ color: 'var(--sapPositiveColor)' }}>●  running</span>
                    ) : (
                      <span style={{ color: 'var(--sapContent_LabelColor)' }}>○  idle</span>
                    )}
                  </span>

                  <FlexBox style={{ gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <Button
                      design="Transparent"
                      icon="play"
                      tooltip="Run now"
                      disabled={triggering === job.id}
                      onClick={() => trigger(job.id)}
                    />
                    <Button
                      design="Transparent"
                      icon="edit"
                      tooltip="Edit"
                      onClick={() => openEdit(job)}
                    />
                    <Button
                      design="Transparent"
                      icon="delete"
                      tooltip="Delete"
                      onClick={() => deleteJob(job.id)}
                    />
                  </FlexBox>

                </div>
              ))}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
