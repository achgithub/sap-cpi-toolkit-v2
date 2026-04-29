import { useState } from 'react'
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
} from '@ui5/webcomponents-react'
import { useClipboard, clipboardName } from '../context/WorkspaceContext'
import SaveAssetDialog from '../components/SaveAssetDialog'
import AssetBrowser from '../components/AssetBrowser'

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'parse' | 'to-xml' | 'from-xml' | 'generate'

interface ParsedSegment { tag: string; elements: string[][] }
interface Summary { sender_id: string; receiver_id: string; message_type: string; reference_no: string; date: string }
interface ParseResult { standard: string; segments: ParsedSegment[]; summary: Summary; errors: string[] }
interface LineItem { item_number: string; quantity: number; unit_price: number }

// ── Constants ─────────────────────────────────────────────────────────────────

const EDIFACT_TYPES = ['ORDERS', 'INVOIC', 'DESADV']
const X12_TYPES     = ['850', '810', '856']

const SAMPLE_EDIFACT = `UNB+UNOA:1+SENDER:1+RECEIVER:1+260101:1200+00001'
UNH+1+ORDERS:D:96A:UN'
BGM+220+PO12345+9'
DTM+137:20260101:102'
NAD+BY+++BUYER COMPANY'
NAD+SU+++SUPPLIER COMPANY'
LIN+1++ITEM-001:SV'
QTY+21:10'
PRI+AAA:25.99:EA'
LIN+2++ITEM-002:SV'
QTY+21:5'
PRI+AAA:99.00:EA'
UNS+S'
CNT+2:2'
UNT+14+1'
UNZ+1+00001'`

const SAMPLE_X12 = `ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260101*1200*^*00501*000000001*0*P*:~
GS*PO*SENDER*RECEIVER*20260101*1200*1*X*005010~
ST*850*0001~
BEG*00*NE*PO12345**20260101~
PO1*1*10*EA*25.99**IN*ITEM-001~
PO1*2*5*EA*99.00**IN*ITEM-002~
CTT*2~
SE*7*0001~
GE*1*1~
IEA*1*000000001~`

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function parseLineItems(raw: string): LineItem[] {
  return raw.trim().split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [item, qty, price] = l.split(',').map(s => s.trim())
    return { item_number: item || 'ITEM-001', quantity: parseFloat(qty) || 1, unit_price: parseFloat(price) || 0 }
  })
}

async function apiPost<T>(path: string, body: unknown): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(`/api/v2${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) return { error: (json as { error?: string }).error ?? `HTTP ${res.status}` }
    return { data: json as T }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Request failed' }
  }
}

// ── Segment viewer ────────────────────────────────────────────────────────────

function SegmentTable({ segments }: { segments: ParsedSegment[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ background: 'var(--sapList_HeaderBackground)' }}>
            <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', borderBottom: '2px solid var(--sapList_BorderColor)', width: '4rem' }}>Tag</th>
            <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', borderBottom: '2px solid var(--sapList_BorderColor)' }}>Elements</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--sapList_BorderColor)', background: i % 2 === 0 ? undefined : 'var(--sapList_AlternatingBackground)' }}>
              <td style={{ padding: '0.3rem 0.6rem', fontWeight: 700, color: 'var(--sapHighlightColor)' }}>{seg.tag}</td>
              <td style={{ padding: '0.3rem 0.6rem' }}>
                {seg.elements.map((el, j) => (
                  <span key={j} style={{ marginRight: '0.75rem' }}>
                    <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.7rem' }}>{j+1}:</span>
                    {' '}{el.join(':')}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Mode button bar ───────────────────────────────────────────────────────────

const MODES: { id: Mode; label: string }[] = [
  { id: 'parse',    label: 'Parse & View' },
  { id: 'to-xml',   label: 'EDI → XML'   },
  { id: 'from-xml', label: 'XML → EDI'   },
  { id: 'generate', label: 'Generate'    },
]

function ModeBar({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      {MODES.map(m => (
        <button key={m.id} onClick={() => onChange(m.id)} style={{
          padding: '0.35rem 1rem', border: '1px solid var(--sapButton_BorderColor)', borderRadius: '0.25rem',
          cursor: 'pointer',
          background: mode === m.id ? 'var(--sapButton_Emphasized_Background)' : 'var(--sapButton_Background)',
          color: mode === m.id ? 'var(--sapButton_Emphasized_TextColor)' : 'var(--sapButton_TextColor)',
          fontSize: '0.875rem',
        }}>
          {m.label}
        </button>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EDITools() {
  const { clipboard, pushClipboard } = useClipboard()
  const [mode, setMode] = useState<Mode>('parse')

  // Parse
  const [parseInput,  setParseInput]  = useState(SAMPLE_EDIFACT)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parseErr,    setParseErr]    = useState('')
  const [parseBusy,   setParseBusy]   = useState(false)

  // EDI → XML
  const [toXmlInput,  setToXmlInput]  = useState(SAMPLE_EDIFACT)
  const [toXmlResult, setToXmlResult] = useState('')
  const [toXmlFormat, setToXmlFormat] = useState<'semantic'|'technical'>('semantic')
  const [toXmlErr,    setToXmlErr]    = useState('')
  const [toXmlBusy,   setToXmlBusy]  = useState(false)
  const [toXmlSave,   setToXmlSave]  = useState(false)

  // XML → EDI
  const [fromXmlInput,  setFromXmlInput]  = useState('')
  const [fromXmlResult, setFromXmlResult] = useState('')
  const [fromXmlErr,    setFromXmlErr]    = useState('')
  const [fromXmlBusy,   setFromXmlBusy]  = useState(false)
  const [fromXmlSave,   setFromXmlSave]  = useState(false)

  // Generate
  const [genStandard, setGenStandard] = useState('EDIFACT')
  const [genMsgType,  setGenMsgType]  = useState('ORDERS')
  const [genSender,   setGenSender]   = useState('SENDER')
  const [genReceiver, setGenReceiver] = useState('RECEIVER')
  const [genRef,      setGenRef]      = useState('PO12345')
  const [genItems,    setGenItems]    = useState('ITEM-001,10,25.99\nITEM-002,5,99.00')
  const [genResult,   setGenResult]   = useState('')
  const [genErr,      setGenErr]      = useState('')
  const [genBusy,     setGenBusy]     = useState(false)
  const [genSave,     setGenSave]     = useState(false)

  // Asset browser
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseTarget, setBrowseTarget] = useState<'parse'|'to-xml'|'from-xml'>('parse')

  function openBrowse(target: 'parse'|'to-xml'|'from-xml') { setBrowseTarget(target); setBrowseOpen(true) }
  function onAssetLoad(content: string) {
    if (browseTarget === 'parse')    { setParseInput(content);    setParseResult(null) }
    if (browseTarget === 'to-xml')   { setToXmlInput(content);    setToXmlResult('')   }
    if (browseTarget === 'from-xml') { setFromXmlInput(content);  setFromXmlResult('') }
    setBrowseOpen(false)
  }

  async function doParse() {
    setParseBusy(true); setParseErr(''); setParseResult(null)
    const r = await apiPost<ParseResult>('/edi/parse', { content: parseInput })
    if (r.error) setParseErr(r.error); else if (r.data) setParseResult(r.data)
    setParseBusy(false)
  }

  async function doToXml() {
    setToXmlBusy(true); setToXmlErr(''); setToXmlResult('')
    const endpoint = toXmlFormat === 'semantic' ? '/edi/to-semantic-xml' : '/edi/to-xml'
    const r = await apiPost<{ xml: string }>(endpoint, { content: toXmlInput })
    if (r.error) setToXmlErr(r.error); else if (r.data) setToXmlResult(r.data.xml)
    setToXmlBusy(false)
  }

  async function doFromXml() {
    setFromXmlBusy(true); setFromXmlErr(''); setFromXmlResult('')
    const r = await apiPost<{ edi: string }>('/edi/from-xml', { content: fromXmlInput })
    if (r.error) setFromXmlErr(r.error); else if (r.data) setFromXmlResult(r.data.edi)
    setFromXmlBusy(false)
  }

  async function doGenerate() {
    setGenBusy(true); setGenErr(''); setGenResult('')
    const r = await apiPost<{ edi: string }>('/edi/generate', {
      standard: genStandard, message_type: genMsgType,
      sender_id: genSender, receiver_id: genReceiver, reference_no: genRef,
      line_items: parseLineItems(genItems),
    })
    if (r.error) setGenErr(r.error); else if (r.data) setGenResult(r.data.edi)
    setGenBusy(false)
  }

  const msgTypes = genStandard === 'EDIFACT' ? EDIFACT_TYPES : X12_TYPES

  // ── Shared action buttons ──────────────────────────────────────────────────

  function ActionRow({ children }: { children: React.ReactNode }) {
    return <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>{children}</FlexBox>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>

      <AssetBrowser
        open={browseOpen}
        filterType="edi"
        onSelect={content => onAssetLoad(content)}
        onClose={() => setBrowseOpen(false)}
      />

      {/* Mode bar */}
      <Card>
        <div style={{ padding: '0.75rem 1rem' }}>
          <ModeBar mode={mode} onChange={m => setMode(m)} />
        </div>
      </Card>

      {/* ── Parse & View ── */}
      {mode === 'parse' && (
        <>
          <Card header={<CardHeader titleText="EDI Input" subtitleText="Paste EDIFACT or X12 — standard is auto-detected"
            action={
              <FlexBox style={{ gap: '0.25rem' }}>
                <Button design="Transparent" icon="open-folder" onClick={() => openBrowse('parse')}>Load asset</Button>
                <Button design="Transparent" icon="paste" disabled={clipboard.length === 0} onClick={() => { setParseInput(clipboard[0].content); setParseResult(null) }}>Paste clipboard</Button>
              </FlexBox>
            }
          />}>
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <TextArea value={parseInput} rows={10} style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
                onInput={e => { setParseInput((e.target as unknown as HTMLTextAreaElement).value); setParseResult(null) }} />
              {parseErr && <MessageStrip design="Negative" hideCloseButton>{parseErr}</MessageStrip>}
              <ActionRow>
                <Button design="Emphasized" disabled={!parseInput.trim() || parseBusy} onClick={doParse}>{parseBusy ? 'Parsing…' : 'Parse'}</Button>
                <Button design="Transparent" onClick={() => { setParseInput(SAMPLE_EDIFACT); setParseResult(null) }}>EDIFACT sample</Button>
                <Button design="Transparent" onClick={() => { setParseInput(SAMPLE_X12); setParseResult(null) }}>X12 sample</Button>
              </ActionRow>
            </div>
          </Card>

          {parseResult && (
            <>
              <Card header={<CardHeader titleText={`${parseResult.standard} Message`} subtitleText={parseResult.summary.message_type} />}>
                <div style={{ padding: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                  {[['Sender', parseResult.summary.sender_id], ['Receiver', parseResult.summary.receiver_id],
                    ['Type', parseResult.summary.message_type], ['Reference', parseResult.summary.reference_no],
                    ['Date', parseResult.summary.date]].filter(([,v]) => v).map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>{label}</div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {parseResult.errors?.length > 0 && (
                <Card header={<CardHeader titleText="Validation Errors" />}>
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {parseResult.errors.map((e, i) => <MessageStrip key={i} design="Negative" hideCloseButton>{e}</MessageStrip>)}
                  </div>
                </Card>
              )}

              <Card header={<CardHeader titleText="Segments" subtitleText={`${parseResult.segments.length} segments`} />}>
                <div style={{ padding: '0.5rem' }}><SegmentTable segments={parseResult.segments} /></div>
              </Card>
            </>
          )}
        </>
      )}

      {/* ── EDI → XML ── */}
      {mode === 'to-xml' && (
        <Card header={<CardHeader
          titleText="EDI → XML"
          subtitleText={toXmlFormat === 'semantic' ? 'Semantic — business-named elements for SAP CPI mapping' : 'Technical — raw structure, round-trippable back to EDI'}
          action={
            <FlexBox style={{ gap: '0.25rem' }}>
              <Button design="Transparent" icon="open-folder" onClick={() => openBrowse('to-xml')}>Load asset</Button>
              <Button design="Transparent" icon="paste" disabled={clipboard.length === 0} onClick={() => { setToXmlInput(clipboard[0].content); setToXmlResult('') }}>Paste clipboard</Button>
            </FlexBox>
          }
        />}>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <Label>XML Format</Label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['semantic', 'technical'] as const).map(f => (
                  <button key={f} onClick={() => { setToXmlFormat(f); setToXmlResult('') }} style={{
                    padding: '0.25rem 0.75rem', border: '1px solid var(--sapButton_BorderColor)', borderRadius: '0.25rem', cursor: 'pointer',
                    background: toXmlFormat === f ? 'var(--sapButton_Emphasized_Background)' : 'var(--sapButton_Background)',
                    color: toXmlFormat === f ? 'var(--sapButton_Emphasized_TextColor)' : 'var(--sapButton_TextColor)',
                    fontSize: '0.875rem',
                  }}>{f === 'semantic' ? 'Semantic' : 'Technical'}</button>
                ))}
              </div>
            </FlexBox>

            {toXmlFormat === 'technical' && (
              <MessageStrip design="Information" hideCloseButton>Technical XML preserves raw structure and can be converted back to EDI using the XML → EDI mode.</MessageStrip>
            )}

            <TextArea value={toXmlInput} rows={10} style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={e => { setToXmlInput((e.target as unknown as HTMLTextAreaElement).value); setToXmlResult('') }} />
            {toXmlErr && <MessageStrip design="Negative" hideCloseButton>{toXmlErr}</MessageStrip>}

            <ActionRow>
              <Button design="Emphasized" disabled={!toXmlInput.trim() || toXmlBusy} onClick={doToXml}>{toXmlBusy ? 'Converting…' : 'Convert to XML'}</Button>
              {toXmlResult && <>
                <Button icon="copy" design="Transparent" onClick={() => { navigator.clipboard.writeText(toXmlResult); pushClipboard({ name: clipboardName('EDI-XML'), content: toXmlResult, source: 'EDI Tools' }) }}>Copy</Button>
                <Button icon="download" design="Transparent" onClick={() => downloadText(toXmlResult, 'edi_message.xml')}>Download</Button>
                <Button icon="save" design="Transparent" onClick={() => setToXmlSave(true)}>Save asset</Button>
              </>}
            </ActionRow>

            {toXmlResult && (
              <TextArea value={toXmlResult} rows={16} readonly style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />
            )}
          </div>
        </Card>
      )}

      {/* ── XML → EDI ── */}
      {mode === 'from-xml' && (
        <Card header={<CardHeader titleText="XML → EDI" subtitleText="Convert toolkit Technical XML back to raw EDIFACT or X12"
          action={
            <FlexBox style={{ gap: '0.25rem' }}>
              <Button design="Transparent" icon="open-folder" onClick={() => openBrowse('from-xml')}>Load asset</Button>
              <Button design="Transparent" icon="paste" disabled={clipboard.length === 0} onClick={() => { setFromXmlInput(clipboard[0].content); setFromXmlResult('') }}>Paste clipboard</Button>
            </FlexBox>
          }
        />}>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <MessageStrip design="Information" hideCloseButton>Paste the <strong>Technical</strong> XML from the EDI → XML tool. The <code>standard</code> attribute determines output format.</MessageStrip>
            <TextArea value={fromXmlInput} rows={14} placeholder={'<EDIMessage standard="EDIFACT">\n  <Segment tag="UNB">...</Segment>\n</EDIMessage>'}
              style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={e => { setFromXmlInput((e.target as unknown as HTMLTextAreaElement).value); setFromXmlResult('') }} />
            {fromXmlErr && <MessageStrip design="Negative" hideCloseButton>{fromXmlErr}</MessageStrip>}
            <ActionRow>
              <Button design="Emphasized" disabled={!fromXmlInput.trim() || fromXmlBusy} onClick={doFromXml}>{fromXmlBusy ? 'Converting…' : 'Convert to EDI'}</Button>
              {fromXmlResult && <>
                <Button icon="copy" design="Transparent" onClick={() => { navigator.clipboard.writeText(fromXmlResult); pushClipboard({ name: clipboardName('EDI'), content: fromXmlResult, source: 'EDI Tools' }) }}>Copy</Button>
                <Button icon="download" design="Transparent" onClick={() => downloadText(fromXmlResult, 'message.edi')}>Download</Button>
                <Button icon="save" design="Transparent" onClick={() => setFromXmlSave(true)}>Save asset</Button>
              </>}
            </ActionRow>
            {fromXmlResult && <TextArea value={fromXmlResult} rows={12} readonly style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />}
          </div>
        </Card>
      )}

      {/* ── Generate ── */}
      {mode === 'generate' && (
        <Card header={<CardHeader titleText="Generate EDI" subtitleText="Produce a syntactically valid EDIFACT or X12 test file" />}>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <Label>Standard</Label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {['EDIFACT', 'X12'].map(s => (
                    <button key={s} onClick={() => { setGenStandard(s); setGenMsgType(s === 'EDIFACT' ? 'ORDERS' : '850') }} style={{
                      padding: '0.25rem 0.75rem', border: '1px solid var(--sapButton_BorderColor)', borderRadius: '0.25rem', cursor: 'pointer',
                      background: genStandard === s ? 'var(--sapButton_Emphasized_Background)' : 'var(--sapButton_Background)',
                      color: genStandard === s ? 'var(--sapButton_Emphasized_TextColor)' : 'var(--sapButton_TextColor)',
                      fontSize: '0.875rem',
                    }}>{s === 'X12' ? 'ANSI X12' : s}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Message Type</Label>
                <div style={{ marginTop: '0.25rem' }}>
                  <Select onChange={e => setGenMsgType((e.target as unknown as HTMLSelectElement).value)}>
                    {msgTypes.map(t => <Option key={t} value={t} selected={genMsgType === t}>{t}</Option>)}
                  </Select>
                </div>
              </div>
            </FlexBox>

            <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Sender ID',         value: genSender,   set: setGenSender   },
                { label: 'Receiver ID',        value: genReceiver, set: setGenReceiver },
                { label: 'Reference Number',   value: genRef,      set: setGenRef      },
              ].map(({ label, value, set }) => (
                <div key={label} style={{ flex: 1, minWidth: '10rem' }}>
                  <Label>{label}</Label>
                  <Input value={value} style={{ width: '100%', marginTop: '0.25rem' }}
                    onInput={e => set((e.target as unknown as HTMLInputElement).value)} />
                </div>
              ))}
            </FlexBox>

            <div>
              <Label>Line Items <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 400 }}>(ItemNumber, Qty, UnitPrice — one per line)</span></Label>
              <TextArea value={genItems} rows={5} placeholder="ITEM-001,10,25.99" style={{ fontFamily: 'monospace', fontSize: '0.82rem', marginTop: '0.25rem' }}
                onInput={e => setGenItems((e.target as unknown as HTMLTextAreaElement).value)} />
            </div>

            {genErr && <MessageStrip design="Negative" hideCloseButton>{genErr}</MessageStrip>}

            <ActionRow>
              <Button design="Emphasized" disabled={genBusy} onClick={doGenerate}>{genBusy ? 'Generating…' : `Generate ${genStandard} ${genMsgType}`}</Button>
              {genResult && <>
                <Button icon="copy" design="Transparent" onClick={() => { navigator.clipboard.writeText(genResult); pushClipboard({ name: clipboardName('EDI'), content: genResult, source: 'EDI Tools' }) }}>Copy</Button>
                <Button icon="download" design="Transparent" onClick={() => downloadText(genResult, `${genMsgType.toLowerCase()}.edi`)}>Download</Button>
                <Button icon="save" design="Transparent" onClick={() => setGenSave(true)}>Save asset</Button>
                <Button design="Transparent" onClick={() => { setToXmlInput(genResult); setToXmlResult(''); setMode('to-xml') }}>Open in EDI → XML</Button>
              </>}
            </ActionRow>

            {genResult && <TextArea value={genResult} rows={14} readonly style={{ fontFamily: 'monospace', fontSize: '0.82rem' }} />}
          </div>
        </Card>
      )}

      {/* Save dialogs */}
      <SaveAssetDialog open={toXmlSave}   content={toXmlResult}   defaultType="xml"  onClose={() => setToXmlSave(false)} />
      <SaveAssetDialog open={fromXmlSave} content={fromXmlResult} defaultType="other" onClose={() => setFromXmlSave(false)} />
      <SaveAssetDialog open={genSave}     content={genResult}     defaultType="other" onClose={() => setGenSave(false)} />

    </div>
  )
}
