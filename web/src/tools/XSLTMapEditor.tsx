import { useState, useRef, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  Label,
  TextArea,
} from '@ui5/webcomponents-react'

import { useClipboard, clipboardName } from '../context/WorkspaceContext'
import AssetBrowser from '../components/AssetBrowser'
import SaveAssetDialog from '../components/SaveAssetDialog'

interface Field {
  path: string
  detected_type: string
}

interface LoadedXSD {
  name: string
  content: string
  fields: Field[]
}

function FieldList({ xsd, selected, onSelect }: {
  xsd: LoadedXSD | null
  selected: string | null
  onSelect: (path: string) => void
}) {
  if (!xsd) return <div style={{ flex: 1 }} />
  return (
    <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
      {xsd.fields.map(f => (
        <div
          key={f.path}
          onClick={() => onSelect(f.path)}
          style={{
            padding: '0.35rem 0.75rem',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '0.78rem',
            borderBottom: '1px solid var(--sapList_BorderColor)',
            background: selected === f.path ? 'var(--sapList_SelectionBackgroundColor)' : undefined,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ flex: 1, wordBreak: 'break-all' }}>{f.path}</span>
          <span style={{
            fontSize: '0.68rem', fontWeight: 600,
            padding: '0.1rem 0.35rem', borderRadius: '0.5rem',
            background: 'var(--sapNeutralBackground)',
            color: 'var(--sapContent_LabelColor)',
            whiteSpace: 'nowrap',
          }}>{f.detected_type}</span>
        </div>
      ))}
    </div>
  )
}

interface Mapping {
  source: string
  target: string
}

function generateXSLT(source: LoadedXSD, target: LoadedXSD, mappings: Mapping[]): string {
  const targetRoot = target.fields[0]?.path.split('.')[0] ?? 'Output'
  const sourceRoot = source.fields[0]?.path.split('.')[0] ?? 'Input'

  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<xsl:stylesheet version="2.0"`)
  lines.push(`    xmlns:xsl="http://www.w3.org/1999/XSL/Transform">`)
  lines.push(``)
  lines.push(`  <xsl:output method="xml" indent="yes" encoding="UTF-8"/>`)
  lines.push(``)
  lines.push(`  <xsl:template match="/${sourceRoot}">`)
  lines.push(`    <${targetRoot}>`)

  for (const m of mappings) {
    const targetSegs = m.target.split('.')
    const leaf = targetSegs[targetSegs.length - 1]
    const sourcePath = m.source.split('.').slice(1).join('/')
    lines.push(`      <${leaf}><xsl:value-of select="${sourcePath}"/></${leaf}>`)
  }

  for (const f of target.fields) {
    if (!mappings.some(m => m.target === f.path)) {
      const segs = f.path.split('.')
      const leaf = segs[segs.length - 1]
      lines.push(`      <!-- TODO: map ${f.path} -->`)
      lines.push(`      <${leaf}/>`)
    }
  }

  lines.push(`    </${targetRoot}>`)
  lines.push(`  </xsl:template>`)
  lines.push(``)
  lines.push(`</xsl:stylesheet>`)
  return lines.join('\n')
}

export default function XSLTMapEditor() {
  const [sourceXSD, setSourceXSD]     = useState<LoadedXSD | null>(null)
  const [targetXSD, setTargetXSD]     = useState<LoadedXSD | null>(null)
  const [srcSelected, setSrcSelected] = useState<string | null>(null)
  const [tgtSelected, setTgtSelected] = useState<string | null>(null)
  const [srcContent, setSrcContent]   = useState('')
  const [tgtContent, setTgtContent]   = useState('')
  const [mappings, setMappings]       = useState<Mapping[]>([])
  const [xsltCode, setXsltCode]       = useState('')
  const [loadingSrc, setLoadingSrc]   = useState(false)
  const [loadingTgt, setLoadingTgt]   = useState(false)
  const [srcBrowserOpen, setSrcBrowserOpen] = useState(false)
  const [tgtBrowserOpen, setTgtBrowserOpen] = useState(false)
  const [xsltSaveOpen, setXsltSaveOpen] = useState(false)
  const [xsltSent, setXsltSent]       = useState(false)
  const { clipboard, pushClipboard }  = useClipboard()

  const srcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tgtTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const analyseXSD = useCallback(async (content: string, name: string, setFn: (x: LoadedXSD | null) => void, setLoading: (b: boolean) => void) => {
    if (!content.trim()) { setFn(null); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v2/testdata/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, input_type: 'xsd' }),
      })
      const json = await res.json()
      if (res.ok) setFn({ name, content, fields: json.fields ?? [] })
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  const onSrcChange = (text: string) => {
    setSrcContent(text)
    if (srcTimer.current) clearTimeout(srcTimer.current)
    srcTimer.current = setTimeout(() => analyseXSD(text, 'Source', setSourceXSD, setLoadingSrc), 700)
  }

  const onTgtChange = (text: string) => {
    setTgtContent(text)
    if (tgtTimer.current) clearTimeout(tgtTimer.current)
    tgtTimer.current = setTimeout(() => analyseXSD(text, 'Target', setTargetXSD, setLoadingTgt), 700)
  }

  const addMapping = () => {
    if (!srcSelected || !tgtSelected) return
    setMappings(prev => {
      const filtered = prev.filter(m => m.target !== tgtSelected)
      return [...filtered, { source: srcSelected, target: tgtSelected }]
    })
    setSrcSelected(null); setTgtSelected(null)
  }

  const removeMapping = (idx: number) =>
    setMappings(prev => prev.filter((_, i) => i !== idx))

  const generateSkeleton = () => {
    if (!sourceXSD || !targetXSD) return
    setXsltCode(generateXSLT(sourceXSD, targetXSD, mappings))
  }

  const canMap = srcSelected && tgtSelected

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>

      {/* XSD selector row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'start' }}>

        {/* Source */}
        <Card header={
          <CardHeader
            titleText="Source XSD"
            subtitleText={sourceXSD ? `${sourceXSD.fields.length} field${sourceXSD.fields.length !== 1 ? 's' : ''} — click to map` : 'Paste or load an XSD to see fields'}
            action={
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <Button design="Transparent" icon="paste" disabled={clipboard.length === 0}
                  onClick={() => onSrcChange(clipboard[0].content)}>
                  Paste clipboard
                </Button>
                <Button design="Transparent" icon="open-folder" onClick={() => setSrcBrowserOpen(true)}>
                  Load asset
                </Button>
                {srcContent && <Button design="Transparent" icon="decline" onClick={() => { setSrcContent(''); setSourceXSD(null); setMappings([]) }} />}
              </div>
            }
          />
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem 1rem' }}>
            <TextArea
              value={srcContent}
              placeholder={'<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n  …\n</xs:schema>'}
              rows={6}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem' }}
              onInput={(e) => onSrcChange((e.target as unknown as HTMLTextAreaElement).value)}
            />
            {loadingSrc && <Label style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>Analysing…</Label>}
            {sourceXSD && sourceXSD.fields.length > 0 && (
              <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', overflow: 'auto', maxHeight: '180px' }}>
                <FieldList xsd={sourceXSD} selected={srcSelected} onSelect={setSrcSelected} />
              </div>
            )}
          </div>
        </Card>

        {/* Mapping panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '160px', paddingTop: '0.5rem' }}>
          <Button
            design={canMap ? 'Emphasized' : 'Default'}
            disabled={!canMap}
            onClick={addMapping}
            icon="arrow-right"
          >
            Map
          </Button>
          <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center' }}>
            Select source field, then target field, then Map
          </div>
          {mappings.length > 0 && (
            <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '0.25rem', overflow: 'auto', maxHeight: '180px' }}>
              {mappings.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.5rem', gap: '0.25rem', borderBottom: '1px solid var(--sapList_BorderColor)', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0070f2' }}>
                    {m.source.split('.').slice(-2).join('.')}
                  </span>
                  <span style={{ color: 'var(--sapNeutralColor)' }}>→</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#107e3e' }}>
                    {m.target.split('.').slice(-2).join('.')}
                  </span>
                  <Button design="Transparent" icon="delete" style={{ padding: '0 0.25rem', minWidth: 0 }}
                    onClick={() => removeMapping(i)} />
                </div>
              ))}
            </div>
          )}
          {mappings.length > 0 && (
            <Button design="Transparent" onClick={() => setMappings([])}>Clear mappings</Button>
          )}
        </div>

        {/* Target */}
        <Card header={
          <CardHeader
            titleText="Target XSD"
            subtitleText={targetXSD ? `${targetXSD.fields.length} field${targetXSD.fields.length !== 1 ? 's' : ''} — click to map` : 'Paste or load an XSD to see fields'}
            action={
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <Button design="Transparent" icon="paste" disabled={clipboard.length === 0}
                  onClick={() => onTgtChange(clipboard[0].content)}>
                  Paste clipboard
                </Button>
                <Button design="Transparent" icon="open-folder" onClick={() => setTgtBrowserOpen(true)}>
                  Load asset
                </Button>
                {tgtContent && <Button design="Transparent" icon="decline" onClick={() => { setTgtContent(''); setTargetXSD(null); setMappings([]) }} />}
              </div>
            }
          />
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem 1rem' }}>
            <TextArea
              value={tgtContent}
              placeholder={'<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n  …\n</xs:schema>'}
              rows={6}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem' }}
              onInput={(e) => onTgtChange((e.target as unknown as HTMLTextAreaElement).value)}
            />
            {loadingTgt && <Label style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>Analysing…</Label>}
            {targetXSD && targetXSD.fields.length > 0 && (
              <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', overflow: 'auto', maxHeight: '180px' }}>
                <FieldList xsd={targetXSD} selected={tgtSelected} onSelect={setTgtSelected} />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* XSLT editor */}
      <Card header={
        <CardHeader
          titleText="XSLT"
          subtitleText="Edit directly, paste from clipboard, or generate a skeleton from the field mappings above"
          action={
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <Button design="Emphasized" disabled={!sourceXSD || !targetXSD}
                onClick={generateSkeleton} icon="generate-shortcut">
                Generate Skeleton
              </Button>
              <Button design="Transparent" icon="paste" disabled={clipboard.length === 0}
                onClick={() => setXsltCode(clipboard[0].content)}>
                Paste clipboard
              </Button>
              <Button design="Transparent" icon="save" disabled={!xsltCode}
                onClick={() => setXsltSaveOpen(true)}>
                Save asset
              </Button>
              <Button design="Transparent" icon={xsltSent ? 'accept' : 'copy'} disabled={!xsltCode}
                onClick={() => {
                  pushClipboard({ name: clipboardName('XSLT'), content: xsltCode, source: 'XSLT Map Editor' })
                  setXsltSent(true); setTimeout(() => setXsltSent(false), 1800)
                }}>
                {xsltSent ? 'Sent!' : 'Copy clipboard'}
              </Button>
              <Button design="Transparent" icon="download" disabled={!xsltCode} onClick={() => {
                const blob = new Blob([xsltCode], { type: 'application/xml' })
                const url  = URL.createObjectURL(blob)
                const a    = document.createElement('a'); a.href = url; a.download = 'mapping.xslt'; a.click()
                URL.revokeObjectURL(url)
              }}>Download</Button>
              {xsltCode && <Button design="Transparent" onClick={() => setXsltCode('')}>Clear</Button>}
            </div>
          }
        />
      }>
        <div style={{ padding: '0.75rem 1rem' }}>
          <TextArea
            value={xsltCode}
            placeholder="<!-- Paste XSLT here, or use Generate Skeleton above -->"
            rows={18}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
            onInput={(e) => setXsltCode((e.target as unknown as HTMLTextAreaElement).value)}
          />
        </div>
      </Card>

      {/* Asset browsers */}
      <AssetBrowser
        open={srcBrowserOpen}
        title="Select Source XSD"
        onClose={() => setSrcBrowserOpen(false)}
        onSelect={(content) => {
          setSrcBrowserOpen(false)
          setSrcContent(content)
          analyseXSD(content, 'Source', setSourceXSD, setLoadingSrc)
          setMappings([])
        }}
      />
      <AssetBrowser
        open={tgtBrowserOpen}
        title="Select Target XSD"
        onClose={() => setTgtBrowserOpen(false)}
        onSelect={(content) => {
          setTgtBrowserOpen(false)
          setTgtContent(content)
          analyseXSD(content, 'Target', setTargetXSD, setLoadingTgt)
          setMappings([])
        }}
      />

      <SaveAssetDialog
        open={xsltSaveOpen}
        content={xsltCode}
        defaultName="mapping"
        defaultType="xslt"
        onClose={() => setXsltSaveOpen(false)}
        onSaved={() => setXsltSaveOpen(false)}
      />
    </div>
  )
}
