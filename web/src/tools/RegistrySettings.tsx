import { useEffect, useState } from 'react'
import { Button, Input, MessageStrip } from '@ui5/webcomponents-react'
import type { SystemTypeConfig, InfraTypeConfig, PlatformConfig } from '../pages/design/diagram/types'

const BASE = '/api/interfaces/config'

const PRESET_COLORS = [
  '#0070F2', '#427CAC', '#FA8231', '#00A1E0', '#5C6BC0',
  '#43A047', '#8D6E63', '#78909C', '#E53935', '#FB8C00',
  '#00ACC1', '#7B1FA2',
]

// ── Generic list editor ───────────────────────────────────────────────────────

function SystemTypeEditor() {
  const [items, setItems]   = useState<SystemTypeConfig[]>([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#78909C')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    fetch(`${BASE}/system_types`).then(r => r.json()).then(setItems).catch(() => {})
  }, [])

  async function save(updated: SystemTypeConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${BASE}/system_types`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Save failed')
      setItems(updated)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  function add() {
    if (!newName.trim()) return
    save([...items, { name: newName.trim(), color: newColor }])
    setNewName(''); setNewColor('#78909C')
  }

  return (
    <Section title="System Types">
      {error && <MessageStrip design="Negative" hideCloseButton style={{ marginBottom: '8px' }}>{error}</MessageStrip>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="color" value={item.color}
              onChange={e => {
                const updated = items.map((x, j) => j === i ? { ...x, color: e.target.value } : x)
                save(updated)
              }}
              style={{ width: '28px', height: '28px', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '3px', flexShrink: 0 }}
              title="Pick colour"
            />
            <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>
              {item.name}
            </span>
            <Button design="Transparent" icon="delete" onClick={() => save(items.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          type="color" value={newColor}
          onChange={e => setNewColor(e.target.value)}
          style={{ width: '28px', height: '28px', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '3px', flexShrink: 0 }}
        />
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setNewColor(c)} title={c} style={{
              width: '16px', height: '16px', borderRadius: '2px', background: c,
              border: newColor === c ? '2px solid var(--sapTextColor)' : '1px solid transparent',
              cursor: 'pointer', padding: 0,
            }} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
        <Input
          placeholder="New system type name"
          value={newName}
          onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)}
          style={{ flex: 1 }}
        />
        <Button design="Emphasized" onClick={add} disabled={saving || !newName.trim()}>Add</Button>
      </div>
    </Section>
  )
}

function InfraTypeEditor() {
  const [items, setItems]   = useState<InfraTypeConfig[]>([])
  const [newName, setNewName] = useState('')
  const [newCat, setNewCat]   = useState<'cloud' | 'on_prem' | 'hybrid'>('cloud')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    fetch(`${BASE}/infra_types`).then(r => r.json()).then(setItems).catch(() => {})
  }, [])

  async function save(updated: InfraTypeConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${BASE}/infra_types`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Save failed')
      setItems(updated)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const catLabel: Record<string, string> = { cloud: '☁ Cloud', on_prem: '🏢 On-Prem', hybrid: '⚡ Hybrid' }

  return (
    <Section title="Infrastructure Types">
      {error && <MessageStrip design="Negative" hideCloseButton style={{ marginBottom: '8px' }}>{error}</MessageStrip>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', flex: 1 }}>{item.name}</span>
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>{catLabel[item.category] ?? item.category}</span>
            <Button design="Transparent" icon="delete" onClick={() => save(items.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <Input placeholder="Name (e.g. AWS, On-Prem)" value={newName}
          onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
        <select
          value={newCat}
          onChange={e => setNewCat(e.target.value as typeof newCat)}
          style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', padding: '0 6px' }}
        >
          <option value="cloud">Cloud</option>
          <option value="on_prem">On-Prem</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <Button design="Emphasized" onClick={() => {
          if (!newName.trim()) return
          save([...items, { name: newName.trim(), category: newCat }])
          setNewName('')
        }} disabled={saving || !newName.trim()}>Add</Button>
      </div>
    </Section>
  )
}

function PlatformEditor() {
  const [items, setItems]   = useState<PlatformConfig[]>([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    fetch(`${BASE}/integration_platforms`).then(r => r.json()).then(setItems).catch(() => {})
  }, [])

  async function save(updated: PlatformConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${BASE}/integration_platforms`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Save failed')
      setItems(updated)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  return (
    <Section title="Integration Platforms">
      {error && <MessageStrip design="Negative" hideCloseButton style={{ marginBottom: '8px' }}>{error}</MessageStrip>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>{item.name}</span>
            <Button design="Transparent" icon="delete" onClick={() => save(items.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <Input placeholder="Platform name (e.g. SAP CPI)" value={newName}
          onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
        <Button design="Emphasized" onClick={() => {
          if (!newName.trim()) return
          save([...items, { name: newName.trim() }])
          setNewName('')
        }} disabled={saving || !newName.trim()}>Add</Button>
      </div>
    </Section>
  )
}

export default function RegistrySettings() {
  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', height: '100%' }}>
      <SystemTypeEditor />
      <InfraTypeEditor />
      <PlatformEditor />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>
        {title}
      </div>
      <div style={{ padding: '12px', background: 'var(--sapGroup_ContentBackground)' }}>
        {children}
      </div>
    </div>
  )
}
