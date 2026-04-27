import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import type * as MonacoType from 'monaco-editor'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxAlignItems,
  FlexBoxDirection,
  Input,
  Label,
  MessageStrip,
  SegmentedButton,
  SegmentedButtonItem,
  TabContainer,
  Tab,
  TextArea,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'
import { SCRIPTS, ALL_TAGS, type LibraryScript, type SampleInput, type Complexity } from '../data/scriptLibrary'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LintError { line: number; column: number; message: string }

interface ExecuteRequest {
  script:     string
  body:       string
  headers:    Record<string, string>
  properties: Record<string, string>
  timeout_ms: number
}

interface ExecuteResult {
  body?:         string
  headers?:      Record<string, string>
  properties?:   Record<string, string>
  stdout?:       string
  execution_ms?: number
  error?:        string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_SCRIPT = `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    // Read the incoming body
    def body = message.getBody(String.class)

    // Access headers and properties
    def headers    = message.getHeaders()
    def properties = message.getProperties()

    // Log to console (captured in the output panel below)
    println "Body length: \${body?.length()}"
    println "Content-Type: \${headers['Content-Type'] ?: 'not set'}"

    // Example transform: add a header and wrap the body
    message.setHeader('X-Processed-By', 'CPI Toolkit')
    message.setBody(body)

    return message
}`

const SAMPLE_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<Order>
  <OrderId>12345</OrderId>
  <Customer>ACME Corp</Customer>
  <Amount>1500.00</Amount>
</Order>`

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseKV(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) result[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return result
}

function kvToString(obj: Record<string, string> | undefined): string {
  if (!obj) return ''
  return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n')
}

function segItem(e: Event) {
  const d = (e as CustomEvent).detail as { selectedItems?: HTMLElement[]; selectedItem?: HTMLElement }
  return d.selectedItems?.[0] ?? d.selectedItem ?? null
}

// ── Script Library ────────────────────────────────────────────────────────────

const COMPLEXITY_ORDER: Complexity[] = ['Beginner', 'Intermediate', 'Advanced']

const COMPLEXITY_COLOR: Record<Complexity, string> = {
  Beginner:     '#107e3e',
  Intermediate: '#0070f2',
  Advanced:     '#e76500',
}

function ComplexityBadge({ level }: { level: Complexity }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: '0.75rem',
      fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.02em',
      color: '#fff', background: COMPLEXITY_COLOR[level],
    }}>
      {level}
    </span>
  )
}

function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <span onClick={onClick} style={{
      display: 'inline-block', padding: '0.1rem 0.55rem', borderRadius: '0.75rem',
      fontSize: '0.72rem', cursor: 'pointer', userSelect: 'none',
      fontWeight: active ? 600 : 400,
      background: active ? 'var(--sapHighlightColor)' : 'var(--sapButton_Lite_Background)',
      color: active ? '#fff' : 'var(--sapTextColor)',
      border: '1px solid ' + (active ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'),
      transition: 'all 0.12s ease',
    }}>
      {label}
    </span>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text; document.body.appendChild(el); el.select()
    document.execCommand('copy'); document.body.removeChild(el)
  }
}

function ScriptCard({ script, onLoadInIDE }: { script: LibraryScript; onLoadInIDE: (body: string, sample?: SampleInput) => void }) {
  const [copied,   setCopied]   = useState(false)
  const [expanded, setExpanded] = useState(false)

  return (
    <Card style={{ marginBottom: '0.75rem' }}>
      <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center}
        style={{ padding: '0.75rem 1rem 0.4rem', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', flex: 1, minWidth: '12rem' }}>{script.title}</span>
        <ComplexityBadge level={script.complexity} />
        {script.tenantOnly && (
          <span style={{ fontSize: '0.72rem', fontWeight: 600, background: '#fef3e2', color: '#e76500',
            border: '1px solid #e76500', borderRadius: '0.75rem', padding: '0.1rem 0.5rem' }}>
            ⚠ Tenant Only
          </span>
        )}
      </FlexBox>

      <FlexBox direction={FlexBoxDirection.Row} style={{ padding: '0 1rem 0.5rem', gap: '0.35rem', flexWrap: 'wrap' }}>
        {script.tags.map(tag => <TagChip key={tag} label={tag} active={false} onClick={() => {}} />)}
      </FlexBox>

      <div style={{ padding: '0 1rem 0.5rem', fontSize: '0.86rem', color: 'var(--sapTextColor)', lineHeight: 1.5 }}>
        {script.description}
      </div>

      {script.tenantOnly && (
        <div style={{ padding: '0 1rem 0.5rem' }}>
          <MessageStrip design="Critical" hideCloseButton>
            ITApiFactory calls are commented out — works in the IDE but only executes on a deployed CPI tenant.
          </MessageStrip>
        </div>
      )}

      <div style={{ padding: '0 1rem 0.5rem' }}>
        <button onClick={() => setExpanded(e => !e)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--sapLinkColor)', fontSize: '0.82rem', padding: '0.2rem 0', textDecoration: 'underline',
        }}>
          {expanded ? '▲ Hide code' : '▶ Show code'}
        </button>
        {expanded && (
          <pre style={{
            background: 'var(--sapShell_Background)', border: '1px solid var(--sapList_BorderColor)',
            borderRadius: '0.25rem', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.78rem',
            lineHeight: 1.55, overflowX: 'auto', overflowY: 'auto', maxHeight: '22rem',
            margin: '0.4rem 0 0', whiteSpace: 'pre',
          }}>
            {script.body}
          </pre>
        )}
      </div>

      <Toolbar style={{ padding: '0.25rem 0.75rem 0.75rem', borderTop: 'none' }}>
        <Button design="Emphasized" icon="source-code" onClick={() => onLoadInIDE(script.body, script.sampleInput)}>
          Load in IDE
        </Button>
        <Button design="Transparent" icon="copy" onClick={async () => {
          await copyText(script.body); setCopied(true); setTimeout(() => setCopied(false), 1800)
        }}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <ToolbarSpacer />
        <Label style={{ color: 'var(--sapNeutralColor)', fontSize: '0.78rem' }}>
          {script.body.split('\n').length} lines
        </Label>
      </Toolbar>
    </Card>
  )
}

function ScriptLibraryPanel({ onLoadInIDE }: { onLoadInIDE: (body: string, sample?: SampleInput) => void }) {
  const [search,     setSearch]     = useState('')
  const [complexity, setComplexity] = useState<Complexity | 'All'>('All')
  const [activeTag,  setActiveTag]  = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return SCRIPTS.filter(s => {
      if (complexity !== 'All' && s.complexity !== complexity) return false
      if (activeTag && !s.tags.includes(activeTag)) return false
      if (q && !s.title.toLowerCase().includes(q) &&
               !s.description.toLowerCase().includes(q) &&
               !s.tags.some(t => t.toLowerCase().includes(q))) return false
      return true
    })
  }, [search, complexity, activeTag])

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
      <Card>
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0.75rem 1rem', gap: '0.6rem' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
            <Label style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Search</Label>
            <Input value={search} placeholder="Filter by title, description or tag…" style={{ flex: 1 }}
              onInput={(e) => setSearch((e.target as unknown as HTMLInputElement).value)} />
            {(search || complexity !== 'All' || activeTag) && (
              <Button design="Transparent" onClick={() => { setSearch(''); setComplexity('All'); setActiveTag('') }}>Clear</Button>
            )}
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <Label style={{ fontWeight: 600, whiteSpace: 'nowrap', marginRight: '0.25rem' }}>Level</Label>
            {(['All', ...COMPLEXITY_ORDER] as const).map(c => (
              <TagChip key={c} label={c} active={complexity === c} onClick={() => setComplexity(c)} />
            ))}
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
            <Label style={{ fontWeight: 600, whiteSpace: 'nowrap', marginRight: '0.25rem' }}>Tag</Label>
            {ALL_TAGS.map(tag => (
              <TagChip key={tag} label={tag} active={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? '' : tag)} />
            ))}
          </FlexBox>
        </FlexBox>
      </Card>

      <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
        <Label style={{ color: 'var(--sapNeutralColor)', fontSize: '0.86rem' }}>
          {filtered.length} of {SCRIPTS.length} scripts
          {filtered.length === 0 && ' — try a different filter'}
        </Label>
      </FlexBox>

      {filtered.map(script => (
        <ScriptCard key={script.id} script={script} onLoadInIDE={onLoadInIDE} />
      ))}
    </FlexBox>
  )
}

// ── IDE Panel ─────────────────────────────────────────────────────────────────

interface IDEPanelProps {
  inject?: { script: string; sample?: SampleInput; key: number }
}

function IDEPanel({ inject }: IDEPanelProps) {
  const [script,     setScript]     = useState(SAMPLE_SCRIPT)
  const [body,       setBody]       = useState(SAMPLE_BODY)
  const [headersRaw, setHeadersRaw] = useState('Content-Type: application/xml')
  const [propsRaw,   setPropsRaw]   = useState('')
  const [timeoutMs,  setTimeoutMs]  = useState(10000)
  const [running,    setRunning]    = useState(false)
  const [result,     setResult]     = useState<ExecuteResult | null>(null)
  const [lintErrors, setLintErrors] = useState<LintError[]>([])
  const [darkTheme,  setDarkTheme]  = useState(false)

  const monaco    = useMonaco()
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null)
  const lintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runLint = useCallback(async (src: string) => {
    if (!monaco || !editorRef.current || !src.trim()) { setLintErrors([]); return }
    try {
      const res  = await fetch('/api/groovy/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: src }),
      })
      const data = await res.json() as { errors?: LintError[] }
      const errors = data.errors ?? []
      setLintErrors(errors)
      const model = editorRef.current?.getModel()
      if (model) {
        monaco.editor.setModelMarkers(model, 'groovy-lint', errors.map(e => ({
          startLineNumber: e.line, startColumn: e.column,
          endLineNumber: e.line, endColumn: 9999,
          message: e.message, severity: monaco.MarkerSeverity.Error,
        })))
      }
    } catch { /* groovy-runner unavailable — fail silently */ }
  }, [monaco])

  const scheduleLint = useCallback((src: string) => {
    if (lintTimer.current) clearTimeout(lintTimer.current)
    lintTimer.current = setTimeout(() => runLint(src), 800)
  }, [runLint])

  useEffect(() => {
    if (monaco && editorRef.current) runLint(script)
  }, [monaco]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!inject?.script) return
    setScript(inject.script)
    setLintErrors([])
    setResult(null)
    if (inject.sample) {
      if (inject.sample.body       !== undefined) setBody(inject.sample.body)
      if (inject.sample.headers    !== undefined) setHeadersRaw(inject.sample.headers)
      if (inject.sample.properties !== undefined) setPropsRaw(inject.sample.properties)
    }
  }, [inject?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setRunning(true); setResult(null)
    const req: ExecuteRequest = {
      script, body,
      headers:    parseKV(headersRaw),
      properties: parseKV(propsRaw),
      timeout_ms: timeoutMs,
    }
    try {
      const resp = await fetch('/api/groovy/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      setResult(await resp.json() as ExecuteResult)
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem', padding: '1rem' }}>

      {/* ── Script editor ── */}
      <Card header={<CardHeader titleText="Groovy Script" subtitleText="Define processData(Message message) — SAP CPI script contract" />}>
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
          <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', overflow: 'hidden' }}>
            <Editor
              height="420px"
              language="java"
              value={script}
              theme={darkTheme ? 'vs-dark' : 'vs'}
              options={{
                fontSize: 13, fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                minimap: { enabled: false }, scrollBeyondLastLine: false,
                wordWrap: 'off', tabSize: 4, automaticLayout: true,
                lineNumbers: 'on', folding: true,
                bracketPairColorization: { enabled: true }, renderLineHighlight: 'line',
              }}
              onChange={(value) => { const v = value ?? ''; setScript(v); scheduleLint(v) }}
              onMount={(editor) => { editorRef.current = editor; runLint(script) }}
            />
          </div>

          {lintErrors.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {lintErrors.map((e, i) => (
                <div key={i} style={{
                  fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--sapNegativeColor)',
                  background: 'var(--sapNegativeBackground)', padding: '0.25rem 0.6rem',
                  borderRadius: '3px', border: '1px solid var(--sapNegativeBorderColor)',
                }}>
                  Line {e.line}:{e.column} — {e.message}
                </div>
              ))}
            </div>
          )}

          <Toolbar>
            <Button design="Emphasized" disabled={running || !script.trim()} onClick={run}>
              {running ? 'Running…' : 'Run Script'}
            </Button>
            <Button design="Transparent" onClick={() => { setScript(SAMPLE_SCRIPT); setLintErrors([]); setResult(null) }}>
              Reset to sample
            </Button>
            {lintErrors.length > 0 && (
              <span style={{ fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapNegativeColor)', fontWeight: 600, padding: '0 0.5rem' }}>
                ✕ {lintErrors.length} lint error{lintErrors.length > 1 ? 's' : ''}
              </span>
            )}
            {lintErrors.length === 0 && script.trim() && (
              <span style={{ fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapPositiveColor)', padding: '0 0.5rem' }}>
                ✓ No errors
              </span>
            )}
            <ToolbarSpacer />
            <Button design="Transparent" onClick={() => setDarkTheme(v => !v)}>
              {darkTheme ? '☀ Light' : '☾ Dark'}
            </Button>
            <Label style={{ color: 'var(--sapNeutralColor)' }}>Timeout</Label>
            <SegmentedButton onSelectionChange={(e) => {
              const v = segItem(e as unknown as Event)?.getAttribute('data-ms')
              if (v) setTimeoutMs(parseInt(v, 10))
            }}>
              <SegmentedButtonItem data-ms="5000"  selected={timeoutMs === 5000}>5s</SegmentedButtonItem>
              <SegmentedButtonItem data-ms="10000" selected={timeoutMs === 10000}>10s</SegmentedButtonItem>
              <SegmentedButtonItem data-ms="30000" selected={timeoutMs === 30000}>30s</SegmentedButtonItem>
            </SegmentedButton>
          </Toolbar>
        </FlexBox>
      </Card>

      {/* ── Input / Output ── */}
      <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', alignItems: 'flex-start' }}>

        <Card header={<CardHeader titleText="Input" subtitleText="Message body, headers and properties" />} style={{ flex: 1 }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
            <Label style={{ fontWeight: 600 }}>Body</Label>
            <TextArea value={body} rows={8}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e) => setBody((e.target as unknown as HTMLTextAreaElement).value)} />

            <Label style={{ fontWeight: 600 }}>
              Headers <span style={{ color: 'var(--sapNeutralColor)', fontWeight: 400 }}>(Key: Value, one per line)</span>
            </Label>
            <TextArea value={headersRaw} rows={3}
              placeholder={'Content-Type: application/xml\nX-Correlation-ID: abc-123'}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e) => setHeadersRaw((e.target as unknown as HTMLTextAreaElement).value)} />

            <Label style={{ fontWeight: 600 }}>
              Properties <span style={{ color: 'var(--sapNeutralColor)', fontWeight: 400 }}>(Key: Value, one per line)</span>
            </Label>
            <TextArea value={propsRaw} rows={3}
              placeholder={'SAP_MplCorrelationId: 123\nSAP_Sender: SystemA'}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e) => setPropsRaw((e.target as unknown as HTMLTextAreaElement).value)} />
          </FlexBox>
        </Card>

        <Card header={<CardHeader titleText="Output" subtitleText={result ? `${result.execution_ms ?? 0} ms` : 'Run the script to see output'} />} style={{ flex: 1 }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
            {!result && <Label style={{ color: 'var(--sapNeutralColor)' }}>Output will appear here after running the script.</Label>}

            {result?.error && (
              <MessageStrip design="Negative" hideCloseButton>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.82rem' }}>
                  {result.error}
                </pre>
              </MessageStrip>
            )}

            {result && !result.error && (
              <>
                <Label style={{ fontWeight: 600 }}>Result Body</Label>
                <TextArea value={result.body ?? ''} rows={8} readonly
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }} />

                {result.stdout && (
                  <>
                    <Label style={{ fontWeight: 600 }}>Console (println output)</Label>
                    <div style={{
                      background: 'var(--sapShell_Background)', border: '1px solid var(--sapList_BorderColor)',
                      borderRadius: '0.25rem', padding: '0.5rem 0.75rem',
                      fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre-wrap',
                      maxHeight: '10rem', overflowY: 'auto',
                    }}>
                      {result.stdout}
                    </div>
                  </>
                )}

                {result.headers && Object.keys(result.headers).length > 0 && (
                  <>
                    <Label style={{ fontWeight: 600 }}>Headers (after script)</Label>
                    <TextArea value={kvToString(result.headers)}
                      rows={Math.min(6, Object.keys(result.headers).length + 1)} readonly
                      style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }} />
                  </>
                )}

                {result.properties && Object.keys(result.properties).length > 0 && (
                  <>
                    <Label style={{ fontWeight: 600 }}>Properties (after script)</Label>
                    <TextArea value={kvToString(result.properties)}
                      rows={Math.min(4, Object.keys(result.properties).length + 1)} readonly
                      style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }} />
                  </>
                )}
              </>
            )}
          </FlexBox>
        </Card>

      </FlexBox>
    </FlexBox>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function GroovyIDE() {
  const [activeTab,  setActiveTab]  = useState(0)
  const [injectKey,  setInjectKey]  = useState(0)
  const [injectData, setInjectData] = useState<{ script: string; sample?: SampleInput } | null>(null)

  function loadInIDE(script: string, sample?: SampleInput) {
    setInjectData({ script, sample })
    setInjectKey(k => k + 1)
    setActiveTab(0)
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TabContainer
        style={{ height: '100%' }}
        onTabSelect={(e) => {
          const idx = (e.detail as unknown as { tabIndex: number }).tabIndex
          setActiveTab(idx)
        }}
      >
        <Tab text="IDE" selected={activeTab === 0}>
          <IDEPanel inject={injectData ? { script: injectData.script, sample: injectData.sample, key: injectKey } : undefined} />
        </Tab>
        <Tab text="Script Library" selected={activeTab === 1}>
          <ScriptLibraryPanel onLoadInIDE={loadInIDE} />
        </Tab>
      </TabContainer>
    </div>
  )
}
