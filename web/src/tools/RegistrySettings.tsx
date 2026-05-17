import { useEffect, useState } from 'react'
import { Button, Input, MessageStrip } from '@ui5/webcomponents-react'
import type { SystemTypeConfig, InfraTypeConfig, PlatformConfig } from '../pages/registry/types'

const BASE = '/api/interfaces/config'

const PRESET_COLORS = [
  '#0070F2', '#427CAC', '#FA8231', '#00A1E0', '#5C6BC0',
  '#43A047', '#8D6E63', '#78909C', '#E53935', '#FB8C00',
  '#00ACC1', '#7B1FA2',
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>
        {title}
      </div>
      <div style={{ padding: '12px', background: 'var(--sapGroup_ContentBackground)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

// ── System Types ──────────────────────────────────────────────────────────────

function SystemTypeEditor() {
  const [items,    setItems]    = useState<SystemTypeConfig[]>([])
  const [editIdx,  setEditIdx]  = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState('#78909C')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => { fetch(`${BASE}/system_types`).then(r => r.json()).then(setItems).catch(() => {}) }, [])

  async function save(updated: SystemTypeConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${BASE}/system_types`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
      if (!res.ok) throw new Error('Save failed')
      setItems(updated)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  function startEdit(i: number) { setEditIdx(i); setEditName(items[i].name) }

  function commitEdit(i: number) {
    if (!editName.trim()) { setEditIdx(null); return }
    save(items.map((x, j) => j === i ? { ...x, name: editName.trim() } : x))
    setEditIdx(null)
  }

  function add() {
    if (!newName.trim()) return
    save([...items, { name: newName.trim(), color: newColor }])
    setNewName(''); setNewColor('#78909C')
  }

  return (
    <Section title="System Types">
      {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

      {/* Existing items */}
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
          <input
            type="color" value={item.color}
            onChange={e => save(items.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
            style={{ width: '26px', height: '26px', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '3px', flexShrink: 0 }}
            title="Change colour"
          />
          {editIdx === i ? (
            <>
              <Input value={editName} onInput={e => setEditName((e.target as unknown as HTMLInputElement).value)}
                style={{ flex: 1, fontSize: '0.8rem' }} />
              <Button design="Transparent" icon="accept" onClick={() => commitEdit(i)} disabled={saving} />
              <Button design="Transparent" icon="decline" onClick={() => setEditIdx(null)} />
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>{item.name}</span>
              <Button design="Transparent" icon="edit" onClick={() => startEdit(i)} />
              <Button design="Transparent" icon="delete" onClick={() => save(items.filter((_, j) => j !== i))} />
            </>
          )}
        </div>
      ))}

      {/* Add new */}
      <div style={{ paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>Add new type</div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setNewColor(c)} title={c} style={{ width: '18px', height: '18px', borderRadius: '3px', background: c, border: newColor === c ? '2px solid var(--sapTextColor)' : '1px solid transparent', cursor: 'pointer', padding: 0 }} />
          ))}
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            style={{ width: '26px', height: '26px', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '3px' }} title="Custom colour" />
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Input placeholder="System type name" value={newName} onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
          <Button design="Emphasized" onClick={add} disabled={saving || !newName.trim()}>Add</Button>
        </div>
      </div>
    </Section>
  )
}

// ── Infrastructure Types ──────────────────────────────────────────────────────

function InfraTypeEditor() {
  const [items,    setItems]    = useState<InfraTypeConfig[]>([])
  const [editIdx,  setEditIdx]  = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editCat,  setEditCat]  = useState<InfraTypeConfig['category']>('cloud')
  const [newName,  setNewName]  = useState('')
  const [newCat,   setNewCat]   = useState<InfraTypeConfig['category']>('cloud')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => { fetch(`${BASE}/infra_types`).then(r => r.json()).then(setItems).catch(() => {}) }, [])

  async function save(updated: InfraTypeConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${BASE}/infra_types`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
      if (!res.ok) throw new Error('Save failed')
      setItems(updated)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const catLabel: Record<string, string> = { cloud: 'Cloud', on_prem: 'On-Prem', hybrid: 'Hybrid' }

  function startEdit(i: number) { setEditIdx(i); setEditName(items[i].name); setEditCat(items[i].category) }

  function commitEdit(i: number) {
    if (!editName.trim()) { setEditIdx(null); return }
    save(items.map((x, j) => j === i ? { name: editName.trim(), category: editCat } : x))
    setEditIdx(null)
  }

  return (
    <Section title="Infrastructure Types">
      {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
          {editIdx === i ? (
            <>
              <Input value={editName} onInput={e => setEditName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
              <select value={editCat} onChange={e => setEditCat(e.target.value as InfraTypeConfig['category'])}
                style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', padding: '4px 6px' }}>
                <option value="cloud">Cloud</option>
                <option value="on_prem">On-Prem</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <Button design="Transparent" icon="accept" onClick={() => commitEdit(i)} disabled={saving} />
              <Button design="Transparent" icon="decline" onClick={() => setEditIdx(null)} />
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>{item.name}</span>
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>{catLabel[item.category]}</span>
              <Button design="Transparent" icon="edit" onClick={() => startEdit(i)} />
              <Button design="Transparent" icon="delete" onClick={() => save(items.filter((_, j) => j !== i))} />
            </>
          )}
        </div>
      ))}

      <div style={{ paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>Add new</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Input placeholder="Name (e.g. AWS)" value={newName} onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
          <select value={newCat} onChange={e => setNewCat(e.target.value as InfraTypeConfig['category'])}
            style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', padding: '4px 6px' }}>
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
      </div>
    </Section>
  )
}

// ── Integration Platforms ─────────────────────────────────────────────────────

function PlatformEditor() {
  const [items,     setItems]     = useState<PlatformConfig[]>([])
  const [editIdx,   setEditIdx]   = useState<number | null>(null)
  const [editName,  setEditName]  = useState('')
  const [editColor, setEditColor] = useState('#E65100')
  const [newName,   setNewName]   = useState('')
  const [newColor,  setNewColor]  = useState('#E65100')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => { fetch(`${BASE}/integration_platforms`).then(r => r.json()).then((d: PlatformConfig[]) => setItems(d.map(p => ({ ...p, color: p.color ?? '#E65100' })))).catch(() => {}) }, [])

  async function save(updated: PlatformConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${BASE}/integration_platforms`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
      if (!res.ok) throw new Error('Save failed')
      setItems(updated)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  function startEdit(i: number) { setEditIdx(i); setEditName(items[i].name); setEditColor(items[i].color ?? '#E65100') }

  function commitEdit(i: number) {
    if (!editName.trim()) { setEditIdx(null); return }
    save(items.map((x, j) => j === i ? { name: editName.trim(), color: editColor } : x))
    setEditIdx(null)
  }

  return (
    <Section title="Integration Platforms">
      {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
          {editIdx === i ? (
            <>
              <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4, flexShrink: 0 }} />
              <Input value={editName} onInput={e => setEditName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
              <Button design="Transparent" icon="accept" onClick={() => commitEdit(i)} disabled={saving} />
              <Button design="Transparent" icon="decline" onClick={() => setEditIdx(null)} />
            </>
          ) : (
            <>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: item.color ?? '#E65100', border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>{item.name}</span>
              <Button design="Transparent" icon="edit" onClick={() => startEdit(i)} />
              <Button design="Transparent" icon="delete" onClick={() => save(items.filter((_, j) => j !== i))} />
            </>
          )}
        </div>
      ))}

      <div style={{ paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>Add new</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4, flexShrink: 0 }} />
          <Input placeholder="Platform name (e.g. SAP CPI)" value={newName} onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
          <Button design="Emphasized" onClick={() => {
            if (!newName.trim()) return
            save([...items, { name: newName.trim(), color: newColor }])
            setNewName('')
          }} disabled={saving || !newName.trim()}>Add</Button>
        </div>
      </div>
    </Section>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function RegistrySettings() {
  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SystemTypeEditor />
      <InfraTypeEditor />
      <PlatformEditor />
    </div>
  )
}
