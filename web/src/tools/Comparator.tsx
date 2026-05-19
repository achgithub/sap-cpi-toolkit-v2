import { useState, useRef } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { Button } from '@ui5/webcomponents-react'
import AssetBrowser, { type AssetMeta } from '../components/AssetBrowser'

// ── Language detection ────────────────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  xml: 'xml', xsl: 'xml', xslt: 'xml', wsdl: 'xml', bpmn: 'xml',
  json: 'json',
  groovy: 'groovy', java: 'java',
  js: 'javascript', ts: 'typescript',
  yaml: 'yaml', yml: 'yaml',
  sql: 'sql',
  html: 'html', htm: 'html',
  css: 'css',
  sh: 'shell', bash: 'shell',
  properties: 'ini', txt: 'plaintext', csv: 'plaintext', log: 'plaintext',
}

const LANG_OPTIONS: [string, string][] = [
  ['auto',       'Auto-detect'],
  ['xml',        'XML / XSLT'],
  ['json',       'JSON'],
  ['groovy',     'Groovy'],
  ['java',       'Java'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['yaml',       'YAML'],
  ['sql',        'SQL'],
  ['html',       'HTML'],
  ['plaintext',  'Plain text'],
]

function detectLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Side { content: string; label: string }
const EMPTY: Side = { content: '', label: '' }

// ── Side source picker ────────────────────────────────────────────────────────

function SidePicker({ title, color, side, onUpload, onAsset, onClear }: {
  title:    string
  color:    string
  side:     Side
  onUpload: () => void
  onAsset:  () => void
  onClear:  () => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
      <span style={{
        fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', fontWeight: 700,
        background: color, color: '#fff',
        borderRadius: '3px', padding: '0.1rem 0.4rem', flexShrink: 0,
      }}>
        {title}
      </span>

      {side.label ? (
        <span style={{
          fontFamily: 'monospace', fontSize: '0.78rem',
          color: 'var(--sapTextColor)',
          background: 'var(--sapNeutralBackground)',
          border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '3px', padding: '0.1rem 0.4rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '220px', flexShrink: 1,
        }}>
          {side.label}
        </span>
      ) : (
        <span style={{
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem',
          color: 'var(--sapContent_LabelColor)', fontStyle: 'italic', flexShrink: 0,
        }}>
          No file loaded
        </span>
      )}

      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
        <Button design="Transparent" icon="upload" onClick={onUpload}
          style={{ fontSize: '0.78rem', height: '1.75rem', padding: '0 0.5rem' }}>
          Upload
        </Button>
        <Button design="Transparent" icon="folder" onClick={onAsset}
          style={{ fontSize: '0.78rem', height: '1.75rem', padding: '0 0.5rem' }}>
          Asset
        </Button>
        {side.content && (
          <Button design="Transparent" icon="decline" onClick={onClear}
            style={{ height: '1.75rem', padding: '0 0.4rem' }} />
        )}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: '0.75rem',
      color: 'var(--sapContent_LabelColor)',
      fontFamily: 'var(--sapFontFamily)',
    }}>
      <div style={{ fontSize: '2.5rem', opacity: 0.25 }}>⇄</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Load two files to compare</div>
      <div style={{ fontSize: '0.8rem' }}>Upload a file or load from Asset Library on each side</div>
    </div>
  )
}

// ── Diff stats banner ─────────────────────────────────────────────────────────

function computeStats(a: string, b: string): { added: number; removed: number; identical: boolean } {
  if (!a && !b) return { added: 0, removed: 0, identical: true }
  if (a === b)  return { added: 0, removed: 0, identical: true }

  const linesA = a ? a.split('\n') : []
  const linesB = b ? b.split('\n') : []
  const setA = new Set(linesA)
  const setB = new Set(linesB)

  const added   = linesB.filter(l => !setA.has(l)).length
  const removed = linesA.filter(l => !setB.has(l)).length
  return { added, removed, identical: false }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Comparator() {
  const [sideA,      setSideA]      = useState<Side>(EMPTY)
  const [sideB,      setSideB]      = useState<Side>(EMPTY)
  const [language,   setLanguage]   = useState('auto')
  const [renderMode, setRenderMode] = useState<'side-by-side' | 'inline'>('side-by-side')
  const [darkTheme,  setDarkTheme]  = useState(false)
  const [browserFor, setBrowserFor] = useState<'A' | 'B' | null>(null)

  const fileInputA = useRef<HTMLInputElement>(null)
  const fileInputB = useRef<HTMLInputElement>(null)

  function readFile(file: File, setSide: (s: Side) => void) {
    const reader = new FileReader()
    reader.onload = e => setSide({ content: e.target?.result as string ?? '', label: file.name })
    reader.readAsText(file)
  }

  const effectiveLang = language === 'auto'
    ? (sideA.label ? detectLang(sideA.label) : sideB.label ? detectLang(sideB.label) : 'plaintext')
    : language

  const bothLoaded = !!(sideA.content || sideB.content)
  const stats      = bothLoaded ? computeStats(sideA.content, sideB.content) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        padding: '0.5rem 1rem', flexShrink: 0,
        borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)',
      }}>
        <SidePicker
          title="A — Original" color="#0070f2"
          side={sideA}
          onUpload={() => fileInputA.current?.click()}
          onAsset={() => setBrowserFor('A')}
          onClear={() => setSideA(EMPTY)}
        />

        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--sapList_BorderColor)', flexShrink: 0 }} />

        <SidePicker
          title="B — Modified" color="#c44"
          side={sideB}
          onUpload={() => fileInputB.current?.click()}
          onAsset={() => setBrowserFor('B')}
          onClear={() => setSideB(EMPTY)}
        />

        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--sapList_BorderColor)', flexShrink: 0 }} />

        {/* Language */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
            Lang:
          </span>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            style={{
              fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem',
              border: '1px solid var(--sapField_BorderColor)',
              borderRadius: '4px', padding: '0.15rem 0.35rem',
              background: 'var(--sapField_Background)',
              color: 'var(--sapField_TextColor)',
              cursor: 'pointer', height: '1.75rem',
            }}
          >
            {LANG_OPTIONS.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* View mode toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--sapButton_BorderColor)', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
          {(['side-by-side', 'inline'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setRenderMode(mode)}
              style={{
                padding: '0.15rem 0.65rem', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
                background: renderMode === mode ? 'var(--sapHighlightColor)' : 'var(--sapButton_Background)',
                color: renderMode === mode ? '#fff' : 'var(--sapButton_TextColor)',
                fontWeight: renderMode === mode ? 600 : 400,
                height: '1.75rem',
              }}
            >
              {mode === 'side-by-side' ? 'Side by side' : 'Inline'}
            </button>
          ))}
        </div>

        {/* Dark theme */}
        <Button
          design="Transparent"
          icon={darkTheme ? 'lightbulb' : 'background'}
          onClick={() => setDarkTheme(d => !d)}
          title={darkTheme ? 'Light theme' : 'Dark theme'}
          style={{ flexShrink: 0, height: '1.75rem' }}
        />
      </div>

      {/* ── Stats banner ─────────────────────────────────────────────────── */}
      {stats && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '0.3rem 1rem', flexShrink: 0,
          background: stats.identical
            ? 'var(--sapSuccessBackground, #f1fdf6)'
            : 'var(--sapNeutralBackground)',
          borderBottom: '1px solid var(--sapList_BorderColor)',
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem',
        }}>
          {stats.identical ? (
            <span style={{ color: 'var(--sapPositiveColor, #107e3e)', fontWeight: 600 }}>
              ✓ Files are identical
            </span>
          ) : (
            <>
              <span style={{ color: 'var(--sapPositiveColor, #107e3e)', fontWeight: 600 }}>
                +{stats.added} added
              </span>
              <span style={{ color: 'var(--sapNegativeColor, #bb0000)', fontWeight: 600 }}>
                −{stats.removed} removed
              </span>
              <span style={{ color: 'var(--sapContent_LabelColor)' }}>
                (line-level estimate — see editor for character-level detail)
              </span>
            </>
          )}

          {/* Language badge */}
          <span style={{ marginLeft: 'auto', color: 'var(--sapContent_LabelColor)' }}>
            {effectiveLang}
          </span>
        </div>
      )}

      {/* ── Editor area ──────────────────────────────────────────────────── */}
      {bothLoaded ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <DiffEditor
            height="100%"
            original={sideA.content}
            modified={sideB.content}
            language={effectiveLang}
            theme={darkTheme ? 'vs-dark' : 'vs'}
            options={{
              renderSideBySide: renderMode === 'side-by-side',
              fontSize: 13,
              fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              readOnly: true,
              automaticLayout: true,
              lineNumbers: 'on',
              folding: true,
              wordWrap: 'off',
              originalEditable: false,
            }}
          />
        </div>
      ) : (
        <EmptyState />
      )}

      {/* ── Hidden file inputs ────────────────────────────────────────────── */}
      <input
        ref={fileInputA} type="file" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f, setSideA); e.target.value = '' }}
      />
      <input
        ref={fileInputB} type="file" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f, setSideB); e.target.value = '' }}
      />

      {/* ── Asset browsers ───────────────────────────────────────────────── */}
      <AssetBrowser
        open={browserFor === 'A'}
        onClose={() => setBrowserFor(null)}
        title="Load Asset — Side A (Original)"
        onSelect={(content, meta: AssetMeta) => {
          setSideA({ content, label: meta.name })
          setBrowserFor(null)
        }}
      />
      <AssetBrowser
        open={browserFor === 'B'}
        onClose={() => setBrowserFor(null)}
        title="Load Asset — Side B (Modified)"
        onSelect={(content, meta: AssetMeta) => {
          setSideB({ content, label: meta.name })
          setBrowserFor(null)
        }}
      />
    </div>
  )
}
