import { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
  MessageStrip,
  TextArea,
  Toolbar,
} from '@ui5/webcomponents-react'
import { useClipboard, clipboardName } from '../context/WorkspaceContext'
import SaveAssetDialog from '../components/SaveAssetDialog'
import AssetBrowser from '../components/AssetBrowser'

const XML_PLACEHOLDER = `<Order>
  <Header>
    <OrderId>10001</OrderId>
    <Date>2024-01-15</Date>
    <Customer>ACME Corp</Customer>
  </Header>
  <Items>
    <Item><SKU>ABC-001</SKU><Qty>5</Qty><Price>12.50</Price></Item>
    <Item><SKU>DEF-002</SKU><Qty>2</Qty><Price>99.00</Price></Item>
  </Items>
</Order>`

export default function XSDGenerator() {
  const [inputXML, setInputXML]   = useState('')
  const [outputXSD, setOutputXSD] = useState('')
  const [warnings, setWarnings]   = useState<string[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [saveOpen, setSaveOpen]   = useState(false)
  const [loadOpen, setLoadOpen]   = useState(false)
  const [outSent, setOutSent]     = useState(false)

  const { clipboard, pushClipboard } = useClipboard()

  const generate = async () => {
    setLoading(true); setError(null); setWarnings([])
    try {
      const res = await fetch('/api/v2/xsd/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: inputXML }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return }
      setOutputXSD(json.xsd ?? '')
      setWarnings(json.warnings ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const downloadXSD = () => {
    const blob = new Blob([outputXSD], { type: 'application/xml' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'schema.xsd'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>

      {/* Input */}
      <Card header={<CardHeader titleText="Sample XML" subtitleText="Paste or type a representative XML document" />}>
        <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
            <Button icon="paste" design="Transparent" disabled={clipboard.length === 0}
              onClick={() => { setInputXML(clipboard[0].content); setOutputXSD('') }}>
              Paste clipboard
            </Button>
            <Button icon="open-folder" design="Transparent" onClick={() => setLoadOpen(true)}>
              Load asset
            </Button>
          </div>
          <TextArea
            value={inputXML}
            placeholder={XML_PLACEHOLDER}
            rows={14}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
            onInput={(e) => { setInputXML((e.target as unknown as HTMLTextAreaElement).value); setOutputXSD('') }}
          />
        </div>
      </Card>

      {/* Actions */}
      <Toolbar design="Transparent" style={{ padding: 0 }}>
        <Button design="Emphasized" disabled={!inputXML.trim() || loading} onClick={generate}>
          {loading ? 'Generating…' : 'Generate XSD'}
        </Button>
        {inputXML && (
          <Button design="Transparent" onClick={() => { setInputXML(''); setOutputXSD(''); setWarnings([]); setError(null) }}>
            Clear
          </Button>
        )}
      </Toolbar>

      {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
      {warnings.map((w, i) => (
        <MessageStrip key={i} design="Information" hideCloseButton>{w}</MessageStrip>
      ))}

      {/* Output */}
      {outputXSD && (
        <Card header={
          <CardHeader titleText="Generated XSD" subtitleText="Inferred from the sample XML — review minOccurs before use" />
        }>
          <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
              <Button icon={outSent ? 'accept' : 'copy'} design="Transparent"
                onClick={() => {
                  pushClipboard({ name: clipboardName('XSD'), content: outputXSD, source: 'XSD Generator' })
                  setOutSent(true); setTimeout(() => setOutSent(false), 1800)
                }}>
                {outSent ? 'Sent!' : 'Copy clipboard'}
              </Button>
              <Button icon="save" design="Transparent" onClick={() => setSaveOpen(true)}>Save asset</Button>
              <Button icon="download" design="Transparent" onClick={downloadXSD}>Download</Button>
            </div>
            <TextArea
              value={outputXSD}
              rows={16}
              readonly
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
            />
          </div>
        </Card>
      )}

      <AssetBrowser
        open={loadOpen}
        title="Load XML from Assets"
        onClose={() => setLoadOpen(false)}
        onSelect={(content) => { setInputXML(content); setOutputXSD(''); setLoadOpen(false) }}
      />

      <SaveAssetDialog
        open={saveOpen}
        content={outputXSD}
        defaultName="schema"
        defaultType="xsd"
        onClose={() => setSaveOpen(false)}
        onSaved={() => setSaveOpen(false)}
      />
    </div>
  )
}
