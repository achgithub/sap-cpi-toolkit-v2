import {
  Button, Card, CardHeader, FlexBox, FlexBoxDirection,
  FlexBoxJustifyContent, Label, MessageStrip, TextArea,
  Toolbar, ToolbarSeparator, ToolbarSpacer,
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
}

export default function EditorPanel({
  title, subtitle,
  inputLabel = 'Input', outputLabel = 'Output',
  inputValue, outputValue, inputPlaceholder,
  onInputChange, actions,
  samples = [], errors = [], warnings = [],
  loading = false, outputFilename, children,
}: Props) {

  const handleDownload = () => {
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

          {samples.length > 0 && (
            <>
              <ToolbarSeparator />
              {samples.map(s => (
                <Button key={s.label} design="Transparent" icon="example" onClick={() => onInputChange(s.content)}>
                  {s.label}
                </Button>
              ))}
            </>
          )}

          <ToolbarSpacer />
          {outputFilename && outputValue && (
            <Button design="Transparent" icon="download" onClick={handleDownload}>
              {outputFilename}
            </Button>
          )}
        </Toolbar>

        <FlexBox
          direction={FlexBoxDirection.Row}
          justifyContent={FlexBoxJustifyContent.SpaceBetween}
          style={{ gap: '1rem' }}
        >
          <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.25rem' }}>
            <Label>{inputLabel}</Label>
            <TextArea
              value={inputValue}
              placeholder={inputPlaceholder}
              rows={22}
              style={{ width: '100%', fontFamily: 'monospace' }}
              onInput={e => onInputChange((e.target as unknown as HTMLTextAreaElement).value)}
            />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.25rem' }}>
            <Label>{outputLabel}</Label>
            <TextArea
              value={outputValue}
              rows={22}
              readonly
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </FlexBox>
        </FlexBox>

      </FlexBox>
    </Card>
  )
}
