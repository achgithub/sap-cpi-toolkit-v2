import { useState } from 'react'
import {
  Button, Card, CardHeader, FlexBox, FlexBoxDirection,
  Label, MessageStrip, TextArea, Toolbar, ToolbarSpacer,
} from '@ui5/webcomponents-react'

export interface EditorAction {
  label: string
  onClick: () => void
  disabled?: boolean
  design?: 'Default' | 'Emphasized' | 'Transparent' | 'Positive' | 'Negative' | 'Attention'
}

export interface EditorSample {
  label: string
  content: string
}

interface Props {
  title: string
  subtitle?: string
  inputLabel?: string
  outputLabel?: string
  inputValue: string
  outputValue: string
  inputPlaceholder?: string
  onInputChange: (value: string) => void
  actions: EditorAction[]
  samples?: EditorSample[]
  errors?: string[]
  warnings?: string[]
  loading?: boolean
  outputFilename?: string
  children?: React.ReactNode
  canPaste?: boolean
  onPasteInput?: () => void
  onSendOutput?: () => void
  onLoadAsset?: () => void
  onSaveAsset?: () => void
}

export default function EditorPanel({
  title, subtitle,
  inputLabel = 'Input', outputLabel = 'Output',
  inputValue, outputValue, inputPlaceholder,
  onInputChange, actions,
  samples = [], errors = [], warnings = [],
  loading = false, outputFilename, children,
  canPaste, onPasteInput, onSendOutput,
  onLoadAsset, onSaveAsset,
}: Props) {
  const [sent, setSent] = useState(false)

  function handleSend() {
    onSendOutput?.()
    setSent(true)
    setTimeout(() => setSent(false), 1800)
  }

  function handleDownload() {
    if (!outputValue || !outputFilename) return
    const blob = new Blob([outputValue], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = outputFilename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card header={<CardHeader titleText={title} subtitleText={subtitle} />}>
      <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

        {children}

        {errors.map((msg, i) => (
          <MessageStrip key={`e${i}`} design="Negative" hideCloseButton>{msg}</MessageStrip>
        ))}
        {warnings.map((msg, i) => (
          <MessageStrip key={`w${i}`} design="Critical" hideCloseButton>{msg}</MessageStrip>
        ))}

        {/* ── Input section ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '2rem' }}>
            <Label style={{ fontWeight: 600 }}>{inputLabel}</Label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <Button design="Transparent" icon="open-folder" disabled={!onLoadAsset} onClick={onLoadAsset}>
                Load asset
              </Button>
              <Button design="Transparent" icon="paste" disabled={!canPaste} onClick={onPasteInput}>
                Paste clipboard
              </Button>
            </div>
          </div>
          <TextArea
            value={inputValue}
            placeholder={inputPlaceholder}
            rows={14}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
            onInput={e => onInputChange((e.target as unknown as HTMLTextAreaElement).value)}
          />
        </div>

        {/* ── Actions toolbar ── */}
        <Toolbar>
          {actions.map(a => (
            <Button
              key={a.label}
              design={a.design ?? 'Default'}
              disabled={a.disabled || (loading && a.design === 'Emphasized')}
              onClick={a.onClick}
            >
              {loading && a.design === 'Emphasized' ? 'Working…' : a.label}
            </Button>
          ))}
          {samples.length > 0 && samples.map(s => (
            <Button key={s.label} design="Transparent" icon="example" onClick={() => onInputChange(s.content)}>
              {s.label}
            </Button>
          ))}
          <ToolbarSpacer />
        </Toolbar>

        {/* ── Output section ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '2rem' }}>
            <Label style={{ fontWeight: 600 }}>{outputLabel}</Label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <Button design="Transparent" icon="save" disabled={!outputValue || !onSaveAsset} onClick={onSaveAsset}>
                Save asset
              </Button>
              <Button design="Transparent" icon={sent ? 'accept' : 'copy'} disabled={!outputValue || !onSendOutput}
                onClick={handleSend}>
                {sent ? 'Sent!' : 'Copy clipboard'}
              </Button>
              {outputFilename && (
                <Button design="Transparent" icon="download" disabled={!outputValue} onClick={handleDownload}>
                  Download
                </Button>
              )}
            </div>
          </div>
          <TextArea
            value={outputValue}
            rows={14}
            readonly
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
          />
        </div>

      </FlexBox>
    </Card>
  )
}
