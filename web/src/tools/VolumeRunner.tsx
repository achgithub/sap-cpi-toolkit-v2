import { useState, useEffect, useRef } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CheckBox,
  FlexBox,
  FlexBoxAlignItems,
  Input,
  Label,
  MessageStrip,
  Option,
  ProgressIndicator,
  Select,
} from '@ui5/webcomponents-react'
import { useWorkspace } from '../context/WorkspaceContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestPack {
  id: string
  name: string
  description: string
  case_count: number
}

interface CaseResult {
  case_id: string
  name: string
  status: string
  status_code: number
  duration_ms: number
  waited_seconds?: number
  body_preview: string
  error?: string
}

interface IterationResult {
  iteration: number
  status: string
  duration_ms: number
  cases: CaseResult[]
}

interface VolumeSummary {
  total: number
  passed: number
  failed: number
  avg_ms: number
  min_ms: number
  max_ms: number
  total_time_ms: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColour(s: string) {
  if (s === 'pass') return 'var(--sapPositiveColor)'
  if (s === 'fail') return 'var(--sapNegativeColor)'
  return 'var(--sapWarningColor)'
}

function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

function exportTxt(packs: TestPack[], packId: string, iterations: IterationResult[], summary: VolumeSummary | null) {
  const pack = packs.find(p => p.id === packId)
  const lines: string[] = [
    '=== Volume Runner Results ===',
    `Pack:       ${pack?.name ?? packId}`,
    `Date:       ${new Date().toISOString()}`,
    '',
  ]
  if (summary) {
    lines.push(
      '--- Summary ---',
      `Total:      ${summary.total}`,
      `Passed:     ${summary.passed}`,
      `Failed:     ${summary.failed}`,
      `Avg:        ${fmtMs(Math.round(summary.avg_ms))}`,
      `Min:        ${fmtMs(summary.min_ms)}`,
      `Max:        ${fmtMs(summary.max_ms)}`,
      `Wall time:  ${fmtMs(summary.total_time_ms)}`,
      '',
    )
  }
  lines.push('--- Iterations ---')
  for (const it of iterations) {
    lines.push(`  #${String(it.iteration).padEnd(4)} ${it.status.toUpperCase().padEnd(5)} ${fmtMs(it.duration_ms)}`)
    for (const c of it.cases) {
      const err = c.error ? `  ERR: ${c.error}` : ''
      lines.push(`    [${c.status.toUpperCase()}] ${c.name} (${fmtMs(c.duration_ms)})${err}`)
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `volume-run-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VolumeRunner() {
  const { selectedProject: project } = useWorkspace()

  const [packs, setPacks]             = useState<TestPack[]>([])
  const [packId, setPackId]           = useState('')
  const [iterations, setIterations]   = useState('10')
  const [concurrency, setConcurrency] = useState('3')
  const [stopOnFail, setStopOnFail]   = useState(false)
  const [skipWaits, setSkipWaits]     = useState(true)

  const [running, setRunning]         = useState(false)
  const [results, setResults]         = useState<IterationResult[]>([])
  const [summary, setSummary]         = useState<VolumeSummary | null>(null)
  const [error, setError]             = useState('')
  const [expanded, setExpanded]       = useState<Set<number>>(new Set())

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const qs = project ? `?project_id=${project.id}` : ''
    fetch(`/api/v2/test-packs${qs}`)
      .then(r => r.json())
      .then((list: TestPack[]) => {
        setPacks(list)
        if (list.length > 0 && !packId) setPackId(list[0].id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  async function startRun() {
    if (!packId) return
    setRunning(true)
    setResults([])
    setSummary(null)
    setError('')
    setExpanded(new Set())

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const resp = await fetch('/api/v2/volume-runner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack_id:      packId,
          iterations:   Math.max(1, Math.min(1000, parseInt(iterations) || 10)),
          concurrency:  Math.max(1, Math.min(20, parseInt(concurrency) || 3)),
          stop_on_failure: stopOnFail,
          skip_waits:   skipWaits,
        }),
        signal: ctrl.signal,
      })

      if (!resp.ok || !resp.body) {
        setError('Request failed')
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const chunk of parts) {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const ev = JSON.parse(line.slice(6))
              if (ev.type === 'progress' && ev.result) {
                setResults(prev => [...prev, ev.result])
              } else if (ev.type === 'done' && ev.summary) {
                setSummary(ev.summary)
              } else if (ev.type === 'error') {
                setError(ev.message)
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') setError(String(e))
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  function stopRun() {
    abortRef.current?.abort()
    setRunning(false)
  }

  function toggleExpand(iter: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(iter) ? next.delete(iter) : next.add(iter)
      return next
    })
  }

  const iters    = Math.max(1, Math.min(1000, parseInt(iterations) || 10))
  const progress = results.length > 0 ? Math.round((results.length / iters) * 100) : 0
  const passed   = results.filter(r => r.status === 'pass').length
  const failed   = results.filter(r => r.status !== 'pass').length

  const selectedPack = packs.find(p => p.id === packId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>

      {/* Config */}
      <Card header={<CardHeader titleText="Volume Runner" subtitleText="Run a test pack repeatedly with concurrency control" />}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Pack selector */}
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
            <Label style={{ width: '7rem', flexShrink: 0 }}>Test Pack</Label>
            {packs.length === 0 ? (
              <span style={{ fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
                No test packs found{project ? '' : ' — select a project first'}
              </span>
            ) : (
              <Select
                style={{ minWidth: '260px' }}
                onChange={e => setPackId((e.target as unknown as HTMLSelectElement).value)}
              >
                {packs.map(p => (
                  <Option key={p.id} value={p.id} selected={p.id === packId}>
                    {p.name} ({p.case_count} case{p.case_count !== 1 ? 's' : ''})
                  </Option>
                ))}
              </Select>
            )}
          </FlexBox>

          {/* Iterations + concurrency */}
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
            <Label style={{ width: '7rem', flexShrink: 0 }}>Iterations</Label>
            <Input
              value={iterations}
              onInput={e => setIterations((e.target as unknown as HTMLInputElement).value)}
              style={{ width: '80px' }}
              placeholder="10"
            />
            <Label style={{ marginLeft: '1.5rem', flexShrink: 0 }}>Concurrency</Label>
            <Input
              value={concurrency}
              onInput={e => setConcurrency((e.target as unknown as HTMLInputElement).value)}
              style={{ width: '80px' }}
              placeholder="3"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginLeft: '0.5rem' }}>
              (1–20 simultaneous iterations)
            </span>
          </FlexBox>

          {/* Options */}
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '2rem' }}>
            <CheckBox
              text="Stop on first failure"
              checked={stopOnFail}
              onChange={e => setStopOnFail((e.target as unknown as HTMLInputElement).checked)}
            />
            <CheckBox
              text="Skip wait delays"
              checked={skipWaits}
              onChange={e => setSkipWaits((e.target as unknown as HTMLInputElement).checked)}
            />
          </FlexBox>

          {/* Actions */}
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Button
              design="Emphasized"
              icon="play"
              disabled={running || !packId}
              onClick={startRun}
            >
              Run
            </Button>
            <Button
              design="Negative"
              icon="stop"
              disabled={!running}
              onClick={stopRun}
            >
              Stop
            </Button>
            {results.length > 0 && (
              <Button
                icon="download"
                disabled={running}
                onClick={() => exportTxt(packs, packId, results, summary)}
              >
                Export TXT
              </Button>
            )}
          </FlexBox>

        </div>
      </Card>

      {/* Error */}
      {error && (
        <MessageStrip design="Negative" hideCloseButton>
          {error}
        </MessageStrip>
      )}

      {/* Progress + summary */}
      {(running || results.length > 0) && (
        <Card header={
          <CardHeader
            titleText={running ? `Running… ${results.length} / ${iters}` : `Completed — ${passed} passed, ${failed} failed`}
            subtitleText={selectedPack?.name}
          />
        }>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {running && (
              <ProgressIndicator
                value={progress}
                valueState={failed > 0 ? 'Negative' : 'Positive'}
                style={{ width: '100%' }}
              />
            )}

            {summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                {[
                  { label: 'Total',     value: summary.total },
                  { label: 'Passed',    value: summary.passed,                            color: 'var(--sapPositiveColor)' },
                  { label: 'Failed',    value: summary.failed,                            color: summary.failed > 0 ? 'var(--sapNegativeColor)' : undefined },
                  { label: 'Pass rate', value: summary.total > 0 ? `${Math.round(summary.passed / summary.total * 100)}%` : '–' },
                  { label: 'Avg',       value: fmtMs(Math.round(summary.avg_ms)) },
                  { label: 'Min',       value: fmtMs(summary.min_ms) },
                  { label: 'Max',       value: fmtMs(summary.max_ms) },
                  { label: 'Wall time', value: fmtMs(summary.total_time_ms) },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'var(--sapGroup_ContentBackground)', border: '1px solid var(--sapList_BorderColor)', borderRadius: '0.25rem', padding: '0.5rem 0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>{label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: color ?? 'var(--sapTextColor)' }}>{String(value)}</div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </Card>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <Card header={<CardHeader titleText="Iteration Results" subtitleText="Click a row to expand case details" />}>
          <div style={{ padding: '0 1rem 1rem' }}>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '3rem 1fr 4rem 5rem', gap: '0 0.75rem', padding: '0.4rem 0.5rem', borderBottom: '2px solid var(--sapList_BorderColor)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>
              <span>#</span>
              <span>Status</span>
              <span>Duration</span>
              <span>Cases</span>
            </div>

            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
              {results.map(it => (
                <div key={it.iteration}>
                  {/* Row */}
                  <div
                    onClick={() => toggleExpand(it.iteration)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '3rem 1fr 4rem 5rem',
                      gap: '0 0.75rem',
                      padding: '0.5rem',
                      borderBottom: '1px solid var(--sapList_BorderColor)',
                      cursor: 'pointer',
                      background: expanded.has(it.iteration) ? 'var(--sapList_SelectionBackgroundColor)' : undefined,
                    }}
                  >
                    <span style={{ fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>{it.iteration}</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: statusColour(it.status) }}>
                      {it.status.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.875rem' }}>{fmtMs(it.duration_ms)}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
                      {it.cases.filter(c => c.status === 'pass').length}/{it.cases.length} pass
                    </span>
                  </div>

                  {/* Expanded case details */}
                  {expanded.has(it.iteration) && (
                    <div style={{ background: 'var(--sapGroup_ContentBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', padding: '0.5rem 1rem' }}>
                      {it.cases.map((c, ci) => (
                        <div key={ci} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.25rem 0', borderBottom: ci < it.cases.length - 1 ? '1px dotted var(--sapList_BorderColor)' : undefined }}>
                          <span style={{ width: '2.5rem', fontSize: '0.8rem', fontWeight: 600, color: statusColour(c.status), flexShrink: 0 }}>
                            {c.status.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.8rem', flex: 1, color: 'var(--sapTextColor)' }}>{c.name}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>
                            {fmtMs(c.duration_ms)}
                            {c.waited_seconds ? ` +${c.waited_seconds}s wait` : ''}
                          </span>
                          {c.error && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--sapNegativeColor)', flexShrink: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.error}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
