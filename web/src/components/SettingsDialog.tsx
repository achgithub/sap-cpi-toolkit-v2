import { useState, useEffect } from 'react'
import {
  Button,
  CheckBox,
  Dialog,
  Bar,
  Select,
  Option,
  FlexBox,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  FlexBoxAlignItems,
} from '@ui5/webcomponents-react'

// Stored in localStorage until the settings API endpoint is built (Step 1 CRUD).
const STORAGE_KEY = 'cpi-toolkit-v2-settings'

interface Settings {
  logging: boolean
  logLevel: 'info' | 'debug'
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaultSettings()
}

function defaultSettings(): Settings {
  return { logging: false, logLevel: 'info' }
}

function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

// Exported so other components can read the current logging preference.
export function getLoggingEnabled(): boolean {
  return loadSettings().logging
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsDialog({ open, onClose }: Props) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)

  useEffect(() => {
    if (open) setSettings(loadSettings())
  }, [open])

  function update(patch: Partial<Settings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  return (
    <Dialog
      open={open}
      headerText="Settings"
      onClose={onClose}
      style={{ width: '480px', maxWidth: '95vw' }}
    >
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* General */}
        <section>
          <div style={sectionHeadingStyle}>General</div>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
            <CheckBox
              text="Enable logging"
              checked={settings.logging}
              onChange={(e) => update({ logging: (e.target as unknown as HTMLInputElement).checked })}
            />
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <span style={labelStyle}>Log level</span>
              <Select
                style={{ minWidth: '8rem' }}
                disabled={!settings.logging}
                onChange={(e) =>
                  update({ logLevel: (e.detail as { selectedOption: { value: string } }).selectedOption.value as Settings['logLevel'] })
                }
              >
                <Option value="info"  selected={settings.logLevel === 'info'}>Info</Option>
                <Option value="debug" selected={settings.logLevel === 'debug'}>Debug</Option>
              </Select>
            </FlexBox>
          </FlexBox>
        </section>

        {/* Note */}
        <section>
          <div style={sectionHeadingStyle}>Project Settings</div>
          <p style={{ ...labelStyle, lineHeight: '1.5', margin: 0 }}>
            Instances, sub-projects, and role assignments are managed in the
            <strong> Design</strong> phase for each project.
          </p>
        </section>

      </div>

      <Bar slot="footer">
        <FlexBox
          justifyContent={FlexBoxJustifyContent.End}
          style={{ width: '100%', padding: '0 0.5rem' }}
        >
          <Button design="Emphasized" onClick={onClose}>Done</Button>
        </FlexBox>
      </Bar>
    </Dialog>
  )
}

const sectionHeadingStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '0.75rem',
  color: 'var(--sapContent_LabelColor)',
  fontFamily: 'var(--sapFontFamily)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.625rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--sapTextColor)',
  fontFamily: 'var(--sapFontFamily)',
}
