import { useState } from 'react'
import EditorPanel from '../components/EditorPanel'
import { useClipboard, clipboardName } from '../context/WorkspaceContext'
import AssetBrowser from '../components/AssetBrowser'
import SaveAssetDialog from '../components/SaveAssetDialog'

// ── Client-side XML formatting ────────────────────────────────────────────────

function formatXML(input: string): { output: string; error?: string } {
  if (!input.trim()) return { output: '' }
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(input.trim(), 'text/xml')
    const errEl = doc.querySelector('parsererror')
    if (errEl) {
      const msg = errEl.querySelector('div')?.textContent ?? errEl.textContent ?? 'Invalid XML'
      return { output: '', error: msg.trim() }
    }
    const lines: string[] = []
    const declMatch = input.match(/^<\?xml[^?]*\?>/)
    if (declMatch) lines.push(declMatch[0])
    renderNode(doc.documentElement, 0, lines)
    return { output: lines.join('\n') }
  } catch (e) {
    return { output: '', error: e instanceof Error ? e.message : 'Format error' }
  }
}

function renderNode(el: Element, depth: number, out: string[]) {
  const pad   = '  '.repeat(depth)
  const tag   = el.tagName
  const attrs = Array.from(el.attributes)
    .map(a => ` ${a.name}="${escAttr(a.value)}"`)
    .join('')
  const kids  = Array.from(el.children)

  if (kids.length === 0) {
    const text = el.textContent?.trim() ?? ''
    out.push(text ? `${pad}<${tag}${attrs}>${escText(text)}</${tag}>` : `${pad}<${tag}${attrs}/>`)
  } else {
    out.push(`${pad}<${tag}${attrs}>`)
    kids.forEach(k => renderNode(k, depth + 1, out))
    out.push(`${pad}</${tag}>`)
  }
}

function escAttr(s: string) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;') }
function escText(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// ── Client-side JSON formatting ───────────────────────────────────────────────

function formatJSON(input: string): { output: string; error?: string } {
  if (!input.trim()) return { output: '' }
  try {
    return { output: JSON.stringify(JSON.parse(input), null, 2) }
  } catch (e) {
    return { output: '', error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

// ── Samples ───────────────────────────────────────────────────────────────────

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?><PurchaseOrder><Header><OrderNumber>PO-2026-001</OrderNumber><OrderDate>2026-01-15</OrderDate><Currency>EUR</Currency></Header><Buyer><Name>ACME Corporation</Name><Address><Street>123 Main Street</Street><City>Frankfurt</City><Country>DE</Country></Address></Buyer><Items><Item lineNumber="1"><MaterialNumber>MAT-001</MaterialNumber><Description>Industrial Widget Type A</Description><Quantity unit="EA">50</Quantity><UnitPrice currency="EUR">12.50</UnitPrice></Item></Items></PurchaseOrder>`

const SAMPLE_JSON = `{"invoice":{"number":"INV-2026-0042","date":"2026-02-01","currency":"EUR","supplier":{"name":"Global Supplies GmbH","vatNumber":"DE123456789"},"lines":[{"lineNumber":1,"description":"Industrial Widget Type A","quantity":50,"unitPrice":12.50},{"lineNumber":2,"description":"Steel Bracket 200mm","quantity":100,"unitPrice":4.75}],"totals":{"netAmount":1100.00,"taxAmount":209.00,"grossAmount":1309.00}}}`

// ── Components ────────────────────────────────────────────────────────────────

function XMLFormatterPanel() {
  const [input,       setInput]       = useState('')
  const [output,      setOutput]      = useState('')
  const [error,       setError]       = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [saveOpen,    setSaveOpen]    = useState(false)
  const { clipboard, pushClipboard } = useClipboard()

  function format() {
    const result = formatXML(input)
    setOutput(result.output)
    setError(result.error ?? '')
  }

  function clear() { setInput(''); setOutput(''); setError('') }

  return (
    <>
      <EditorPanel
        title="XML Formatter"
        subtitle="Pretty-print and validate XML"
        inputLabel="XML Input"
        outputLabel="Formatted XML"
        inputPlaceholder="Paste any XML here — purchase orders, invoices, IDoc payloads, CPI message bodies…"
        inputValue={input}
        outputValue={output}
        onInputChange={v => { setInput(v); setOutput(''); setError('') }}
        errors={error ? [error] : []}
        actions={[
          { label: 'Format', onClick: format, disabled: !input.trim(), design: 'Emphasized' },
          { label: 'Clear',  onClick: clear,  design: 'Transparent' },
        ]}
        samples={[{ label: 'Purchase Order', content: SAMPLE_XML }]}
        outputFilename={output ? 'formatted.xml' : undefined}
        canPaste={clipboard.length > 0}
        onPasteInput={() => { setInput(clipboard[0].content); setOutput(''); setError('') }}
        onSendOutput={() => pushClipboard({ name: clipboardName('XML'), content: output, source: 'Formatter' })}
        onLoadAsset={() => setBrowserOpen(true)}
        onSaveAsset={() => setSaveOpen(true)}
      />
      <AssetBrowser open={browserOpen} onClose={() => setBrowserOpen(false)} filterType="xml"
        title="Load XML Asset"
        onSelect={(content) => { setInput(content); setOutput(''); setError(''); setBrowserOpen(false) }} />
      <SaveAssetDialog open={saveOpen} content={output} defaultType="xml"
        defaultName={clipboardName('XML')} onClose={() => setSaveOpen(false)} />
    </>
  )
}

function JSONFormatterPanel() {
  const [input,       setInput]       = useState('')
  const [output,      setOutput]      = useState('')
  const [error,       setError]       = useState('')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [saveOpen,    setSaveOpen]    = useState(false)
  const { clipboard, pushClipboard } = useClipboard()

  function format() {
    const result = formatJSON(input)
    setOutput(result.output)
    setError(result.error ?? '')
  }

  function clear() { setInput(''); setOutput(''); setError('') }

  return (
    <>
      <EditorPanel
        title="JSON Formatter"
        subtitle="Pretty-print and validate JSON"
        inputLabel="JSON Input"
        outputLabel="Formatted JSON"
        inputPlaceholder="Paste any JSON here — API responses, invoices, configuration payloads…"
        inputValue={input}
        outputValue={output}
        onInputChange={v => { setInput(v); setOutput(''); setError('') }}
        errors={error ? [error] : []}
        actions={[
          { label: 'Format', onClick: format, disabled: !input.trim(), design: 'Emphasized' },
          { label: 'Clear',  onClick: clear,  design: 'Transparent' },
        ]}
        samples={[{ label: 'Invoice', content: SAMPLE_JSON }]}
        outputFilename={output ? 'formatted.json' : undefined}
        canPaste={clipboard.length > 0}
        onPasteInput={() => { setInput(clipboard[0].content); setOutput(''); setError('') }}
        onSendOutput={() => pushClipboard({ name: clipboardName('JSON'), content: output, source: 'Formatter' })}
        onLoadAsset={() => setBrowserOpen(true)}
        onSaveAsset={() => setSaveOpen(true)}
      />
      <AssetBrowser open={browserOpen} onClose={() => setBrowserOpen(false)} filterType="json"
        title="Load JSON Asset"
        onSelect={(content) => { setInput(content); setOutput(''); setError(''); setBrowserOpen(false) }} />
      <SaveAssetDialog open={saveOpen} content={output} defaultType="json"
        defaultName={clipboardName('JSON')} onClose={() => setSaveOpen(false)} />
    </>
  )
}

export default function Formatter() {
  const [tab, setTab] = useState<'xml' | 'json'>('xml')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', borderBottom: '2px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)', padding: '0 1rem', flexShrink: 0,
      }}>
        {(['xml', 'json'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.5rem 1.25rem', border: 'none',
            borderBottom: tab === t ? '2px solid var(--sapHighlightColor)' : '2px solid transparent',
            marginBottom: '-2px', background: 'transparent', cursor: 'pointer',
            fontFamily: 'var(--sapFontFamily)', fontSize: 'var(--sapFontSize)',
            color: tab === t ? 'var(--sapHighlightColor)' : 'var(--sapTextColor)',
            fontWeight: tab === t ? 600 : 400,
          }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {tab === 'xml'  && <XMLFormatterPanel />}
        {tab === 'json' && <JSONFormatterPanel />}
      </div>
    </div>
  )
}
