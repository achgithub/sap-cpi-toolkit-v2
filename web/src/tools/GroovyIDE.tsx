import { useState, useEffect, useRef, useCallback } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import type * as MonacoType from 'monaco-editor'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  Label,
  MessageStrip,
  SegmentedButton,
  SegmentedButtonItem,
  TextArea,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'
import { useClipboard, clipboardName } from '../context/WorkspaceContext'
import AssetBrowser from '../components/AssetBrowser'
import type { AssetMeta } from '../components/AssetBrowser'
import SaveAssetDialog from '../components/SaveAssetDialog'

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

// ── IDE Panel ─────────────────────────────────────────────────────────────────

export default function IDEPanel() {
  const [script,     setScript]     = useState(SAMPLE_SCRIPT)
  const [body,       setBody]       = useState(SAMPLE_BODY)
  const [headersRaw, setHeadersRaw] = useState('Content-Type: application/xml')
  const [propsRaw,   setPropsRaw]   = useState('')
  const [timeoutMs,  setTimeoutMs]  = useState(10000)
  const [running,    setRunning]    = useState(false)
  const [result,     setResult]     = useState<ExecuteResult | null>(null)
  const [lintErrors, setLintErrors] = useState<LintError[]>([])
  const [darkTheme,  setDarkTheme]  = useState(false)
  const [scriptSent,      setScriptSent]      = useState(false)
  const [bodySent,        setBodySent]        = useState(false)
  const [scriptBrowser,   setScriptBrowser]   = useState(false)
  const [scriptSave,      setScriptSave]      = useState(false)
  const [bodyBrowser,     setBodyBrowser]     = useState(false)
  const [resultSave,      setResultSave]      = useState(false)
  const { clipboard, pushClipboard } = useClipboard()

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

  function loadFromAsset(content: string, meta: AssetMeta) {
    setScript(content)
    setLintErrors([])
    setResult(null)
    if (meta.meta?.sample_body    !== undefined) setBody(meta.meta.sample_body as string)
    if (meta.meta?.sample_headers !== undefined) setHeadersRaw(meta.meta.sample_headers as string)
    if (meta.meta?.sample_props   !== undefined) setPropsRaw(meta.meta.sample_props as string)
    setScriptBrowser(false)
  }

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
            <Button design="Transparent" icon="open-folder" onClick={() => setScriptBrowser(true)}>
              Load asset
            </Button>
            <Button design="Transparent" icon="save" onClick={() => setScriptSave(true)}>
              Save asset
            </Button>
            <Button design="Transparent" icon="paste" disabled={clipboard.length === 0}
              onClick={() => { setScript(clipboard[0].content); setLintErrors([]); setResult(null) }}>
              Paste clipboard
            </Button>
            <Button design="Transparent" icon={scriptSent ? 'accept' : 'copy'}
              onClick={() => {
                pushClipboard({ name: clipboardName('Groovy script'), content: script, source: 'Groovy IDE' })
                setScriptSent(true); setTimeout(() => setScriptSent(false), 1800)
              }}>
              {scriptSent ? 'Sent!' : 'Copy clipboard'}
            </Button>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Label style={{ fontWeight: 600 }}>Body</Label>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {clipboard.length > 0 && (
                  <Button design="Transparent" icon="paste"
                    style={{ height: '1.5rem', padding: '0 0.4rem', fontSize: '0.75rem' }}
                    onClick={() => setBody(clipboard[0].content)}>
                    Clipboard
                  </Button>
                )}
                <Button design="Transparent" icon="open-folder"
                  style={{ height: '1.5rem', padding: '0 0.4rem', fontSize: '0.75rem' }}
                  onClick={() => setBodyBrowser(true)}>
                  Load asset
                </Button>
              </div>
            </div>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Label style={{ fontWeight: 600 }}>Result Body</Label>
                  {result.body && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <Button design="Transparent" icon={bodySent ? 'accept' : 'copy'}
                        style={{ height: '1.5rem', padding: '0 0.4rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          pushClipboard({ name: clipboardName('Groovy output'), content: result.body ?? '', source: 'Groovy IDE' })
                          setBodySent(true); setTimeout(() => setBodySent(false), 1800)
                        }}>
                        {bodySent ? 'Sent!' : 'Clipboard'}
                      </Button>
                      <Button design="Transparent" icon="save"
                        style={{ height: '1.5rem', padding: '0 0.4rem', fontSize: '0.75rem' }}
                        onClick={() => setResultSave(true)}>
                        Save asset
                      </Button>
                    </div>
                  )}
                </div>
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

      <AssetBrowser open={scriptBrowser} onClose={() => setScriptBrowser(false)}
        filterType="groovy" title="Load Groovy Script"
        onSelect={loadFromAsset} />
      <SaveAssetDialog open={scriptSave} content={script} defaultType="groovy"
        defaultName={clipboardName('Groovy script')}
        meta={{ sample_body: body, sample_headers: headersRaw, sample_props: propsRaw }}
        onClose={() => setScriptSave(false)} onSaved={() => setScriptSave(false)} />
      <AssetBrowser open={bodyBrowser} onClose={() => setBodyBrowser(false)}
        title="Load Asset into Body"
        onSelect={(content) => { setBody(content); setBodyBrowser(false) }} />
      {result?.body && (
        <SaveAssetDialog open={resultSave} content={result.body} defaultType="payload"
          defaultName={clipboardName('Groovy output')} onClose={() => setResultSave(false)} />
      )}
    </FlexBox>
  )
}

