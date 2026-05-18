import { useEffect, useState } from 'react'
import { Button, Input, MessageStrip, Dialog, Bar } from '@ui5/webcomponents-react'
import type { SystemTypeConfig, InfraTypeConfig, PlatformConfig, System } from '../pages/registry/types'
import type { Component } from '../pages/registry/types_v2'

const SYS_BASE  = '/api/interfaces/systems'
const COMP_BASE = '/api/interfaces/v2/components'
const CFG_BASE  = '/api/interfaces/config'

const PRESET_COLORS = [
  '#0070F2', '#427CAC', '#FA8231', '#00A1E0', '#5C6BC0',
  '#43A047', '#8D6E63', '#78909C', '#E53935', '#FB8C00',
  '#00ACC1', '#7B1FA2',
]

const nativeSelect: React.CSSProperties = {
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
  border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px',
  padding: '4px 6px', background: 'var(--sapField_Background)', color: 'var(--sapTextColor)',
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>{title}</span>
        {action}
      </div>
      <div style={{ padding: '12px', background: 'var(--sapGroup_ContentBackground)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>{label}</span>
      {children}
    </div>
  )
}

// ── Systems ───────────────────────────────────────────────────────────────────

type SystemForm = {
  name: string; description: string
  system_type: string; infra_type: string; infra_region: string; owner_type: string
}

const emptySysForm = (): SystemForm => ({
  name: '', description: '', system_type: '', infra_type: '', infra_region: '', owner_type: 'internal',
})

function SystemEditor() {
  const [systems,    setSystems]    = useState<System[]>([])
  const [sysTypes,   setSysTypes]   = useState<SystemTypeConfig[]>([])
  const [infraTypes, setInfraTypes] = useState<InfraTypeConfig[]>([])
  const [form,       setForm]       = useState<SystemForm>(emptySysForm())
  const [editId,     setEditId]     = useState<string | null>(null)
  const [dlgOpen,    setDlgOpen]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    fetch(SYS_BASE).then(r => r.json()).then((d: System[]) =>
      setSystems(d.sort((a, b) => a.name.localeCompare(b.name)))
    ).catch(() => {})
    fetch(`${CFG_BASE}/system_types`).then(r => r.json()).then(setSysTypes).catch(() => {})
    fetch(`${CFG_BASE}/infra_types`).then(r => r.json()).then(setInfraTypes).catch(() => {})
  }, [])

  function openCreate() {
    setEditId(null); setForm(emptySysForm()); setError(''); setDlgOpen(true)
  }

  function openEdit(s: System) {
    setEditId(s.id)
    setForm({ name: s.name, description: s.description, system_type: s.system_type, infra_type: s.infra_type, infra_region: s.infra_region, owner_type: s.owner_type || 'internal' })
    setError(''); setDlgOpen(true)
  }

  function closeDialog() { setDlgOpen(false); setEditId(null) }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      if (editId) {
        const res = await fetch(`${SYS_BASE}/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!res.ok) throw new Error('Save failed')
        const updated = await res.json() as System
        setSystems(prev => prev.map(s => s.id === editId ? updated : s).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        const res = await fetch(SYS_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!res.ok) throw new Error('Save failed')
        const created = await res.json() as System
        setSystems(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      closeDialog()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function del(id: string) {
    if (!window.confirm('Archive this system? It will be hidden from all views but not permanently deleted.')) return
    try {
      await fetch(`${SYS_BASE}/${id}/archive`, { method: 'POST' })
      setSystems(prev => prev.filter(s => s.id !== id))
    } catch { /* ignore */ }
  }

  function getColor(systemType: string) {
    return sysTypes.find(t => t.name === systemType)?.color ?? '#78909C'
  }

  const f = (k: keyof SystemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <Section title="Systems" action={<Button design="Transparent" icon="add" onClick={openCreate}>New System</Button>}>

      {systems.length === 0 && (
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', padding: '8px 0' }}>
          No systems registered. Use New System to add one.
        </div>
      )}

      {systems.map(s => {
        const color = getColor(s.system_type)
        const infra = [s.infra_type, s.infra_region].filter(Boolean).join(' · ')
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', fontWeight: 600 }}>{s.name}</div>
              {(s.system_type || infra) && (
                <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
                  {[s.system_type, infra].filter(Boolean).join(' — ')}
                </div>
              )}
            </div>
            <Button design="Transparent" icon="edit"  onClick={() => openEdit(s)} />
            <Button design="Transparent" icon="away"  title="Archive this system" onClick={() => del(s.id)} />
          </div>
        )
      })}

      <Dialog open={dlgOpen} headerText={editId ? 'Edit System' : 'New System'} onClose={closeDialog} style={{ width: '440px', maxWidth: '95vw' }}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <FormField label="Name *">
            <Input value={form.name} onInput={e => setForm(p => ({ ...p, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </FormField>
          <FormField label="Description">
            <Input value={form.description} onInput={e => setForm(p => ({ ...p, description: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </FormField>
          <FormField label="System Type">
            <select value={form.system_type} onChange={f('system_type')} style={{ ...nativeSelect, width: '100%' }}>
              <option value="">— select type —</option>
              {sysTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormField label="Infrastructure">
              <select value={form.infra_type} onChange={f('infra_type')} style={{ ...nativeSelect, width: '100%' }}>
                <option value="">— unknown —</option>
                {infraTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </FormField>
            <FormField label="Region / Location">
              <Input value={form.infra_region} placeholder="e.g. eu-west-1" onInput={e => setForm(p => ({ ...p, infra_region: (e.target as unknown as HTMLInputElement).value }))} />
            </FormField>
          </div>
          <FormField label="Owner">
            <select value={form.owner_type} onChange={f('owner_type')} style={{ ...nativeSelect, width: '100%' }}>
              <option value="internal">Internal</option>
              <option value="partner">Partner</option>
              <option value="external">External</option>
            </select>
          </FormField>
        </div>
        <Bar slot="footer">
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </Bar>
      </Dialog>

    </Section>
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

  useEffect(() => { fetch(`${CFG_BASE}/system_types`).then(r => r.json()).then(setItems).catch(() => {}) }, [])

  async function save(updated: SystemTypeConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${CFG_BASE}/system_types`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
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
              <Input value={editName} onInput={e => setEditName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1, fontSize: '0.8rem' }} />
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

  useEffect(() => { fetch(`${CFG_BASE}/infra_types`).then(r => r.json()).then(setItems).catch(() => {}) }, [])

  async function save(updated: InfraTypeConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${CFG_BASE}/infra_types`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
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
                style={{ ...nativeSelect }}>
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
          <select value={newCat} onChange={e => setNewCat(e.target.value as InfraTypeConfig['category'])} style={{ ...nativeSelect }}>
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

  useEffect(() => { fetch(`${CFG_BASE}/integration_platforms`).then(r => r.json()).then((d: PlatformConfig[]) => setItems(d.map(p => ({ ...p, color: p.color ?? '#E65100' })))).catch(() => {}) }, [])

  async function save(updated: PlatformConfig[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${CFG_BASE}/integration_platforms`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
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

// ── Component Types (config) ──────────────────────────────────────────────────

function ComponentTypeEditor() {
  const [items,    setItems]    = useState<{ name: string; color: string }[]>([])
  const [editIdx,  setEditIdx]  = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState('#0070F2')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => { fetch(`${CFG_BASE}/component_types`).then(r => r.json()).then(setItems).catch(() => {}) }, [])

  async function save(updated: { name: string; color: string }[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${CFG_BASE}/component_types`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
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

  return (
    <Section title="Integration Component Types">
      {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
          <input type="color" value={item.color}
            onChange={e => save(items.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
            style={{ width: 26, height: 26, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 3, flexShrink: 0 }} />
          {editIdx === i ? (
            <>
              <Input value={editName} onInput={e => setEditName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
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
      <div style={{ paddingTop: 8, display: 'flex', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setNewColor(c)} style={{ width: 18, height: 18, borderRadius: 3, background: c, border: newColor === c ? '2px solid var(--sapTextColor)' : '1px solid transparent', cursor: 'pointer', padding: 0 }} />
          ))}
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 26, height: 26, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 3 }} />
        </div>
        <Input placeholder="Component type name" value={newName} onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
        <Button design="Emphasized" onClick={() => { if (!newName.trim()) return; save([...items, { name: newName.trim(), color: newColor }]); setNewName('') }} disabled={saving || !newName.trim()}>Add</Button>
      </div>
    </Section>
  )
}

// ── Integration Components ────────────────────────────────────────────────────

type CompForm = { name: string; component_type: string; infra_type: string; infra_region: string; description: string }
const emptyCompForm = (): CompForm => ({ name: '', component_type: '', infra_type: '', infra_region: '', description: '' })

function IntegrationComponentEditor() {
  const [items,      setItems]      = useState<Component[]>([])
  const [compTypes,  setCompTypes]  = useState<{ name: string; color: string }[]>([])
  const [infraTypes, setInfraTypes] = useState<{ name: string }[]>([])
  const [form,       setForm]       = useState<CompForm>(emptyCompForm())
  const [editId,     setEditId]     = useState<string | null>(null)
  const [dlgOpen,    setDlgOpen]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    fetch(COMP_BASE).then(r => r.json()).then((d: Component[]) => setItems(d.sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {})
    fetch(`${CFG_BASE}/component_types`).then(r => r.json()).then(setCompTypes).catch(() => {})
    fetch(`${CFG_BASE}/infra_types`).then(r => r.json()).then(setInfraTypes).catch(() => {})
  }, [])

  function openCreate() { setEditId(null); setForm(emptyCompForm()); setError(''); setDlgOpen(true) }
  function openEdit(c: Component) {
    setEditId(c.id)
    setForm({ name: c.name, component_type: c.component_type, infra_type: c.infra_type, infra_region: c.infra_region, description: c.description })
    setError(''); setDlgOpen(true)
  }
  function closeDialog() { setDlgOpen(false); setEditId(null) }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      if (editId) {
        const res = await fetch(`${COMP_BASE}/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!res.ok) throw new Error('Save failed')
        const updated = await res.json() as Component
        setItems(prev => prev.map(c => c.id === editId ? updated : c).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        const res = await fetch(COMP_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!res.ok) throw new Error('Save failed')
        const created = await res.json() as Component
        setItems(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      closeDialog()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function del(id: string) {
    if (!window.confirm('Archive this integration component? It will be hidden from all views but not permanently deleted.')) return
    try { await fetch(`${COMP_BASE}/${id}/archive`, { method: 'POST' }); setItems(prev => prev.filter(c => c.id !== id)) } catch { /* ignore */ }
  }

  function getColor(type: string) { return compTypes.find(t => t.name === type)?.color ?? 'var(--sapHighlightColor)' }

  return (
    <Section title="Integration Components" action={<Button design="Transparent" icon="add" onClick={openCreate}>New Component</Button>}>
      {items.length === 0 && (
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', padding: '8px 0' }}>
          No integration components registered. Use New Component to add one.
        </div>
      )}
      {items.map(c => {
        const color = getColor(c.component_type)
        const infra = [c.infra_type, c.infra_region].filter(Boolean).join(' · ')
        return (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', fontWeight: 600 }}>{c.name}</div>
              {(c.component_type || infra) && (
                <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
                  {[c.component_type, infra].filter(Boolean).join(' — ')}
                </div>
              )}
            </div>
            <Button design="Transparent" icon="edit" onClick={() => openEdit(c)} />
            <Button design="Transparent" icon="away" title="Archive this component" onClick={() => del(c.id)} />
          </div>
        )
      })}

      <Dialog open={dlgOpen} headerText={editId ? 'Edit Component' : 'New Integration Component'} onClose={closeDialog} style={{ width: 440, maxWidth: '95vw' }}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <FormField label="Name *">
            <Input value={form.name} onInput={e => setForm(p => ({ ...p, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </FormField>
          <FormField label="Component Type">
            <select value={form.component_type} onChange={e => setForm(p => ({ ...p, component_type: e.target.value }))} style={{ ...nativeSelect, width: '100%' }}>
              <option value="">— select type —</option>
              {compTypes.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormField label="Infrastructure">
              <select value={form.infra_type} onChange={e => setForm(p => ({ ...p, infra_type: e.target.value }))} style={{ ...nativeSelect, width: '100%' }}>
                <option value="">— unknown —</option>
                {infraTypes.map((t: { name: string }) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </FormField>
            <FormField label="Region / Location">
              <Input value={form.infra_region} placeholder="e.g. EU10" onInput={e => setForm(p => ({ ...p, infra_region: (e.target as unknown as HTMLInputElement).value }))} />
            </FormField>
          </div>
          <FormField label="Description">
            <Input value={form.description} onInput={e => setForm(p => ({ ...p, description: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </FormField>
        </div>
        <Bar slot="footer">
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </Bar>
      </Dialog>
    </Section>
  )
}

// ── Interface Statuses ────────────────────────────────────────────────────────

// SAP UI5 semantic tokens available for status colours.
// These resolve via the active theme — no raw hex values.
const SAP_TOKENS = [
  { label: 'Positive (green)',    value: 'var(--sapPositiveColor)'    },
  { label: 'Negative (red)',      value: 'var(--sapNegativeColor)'    },
  { label: 'Warning (orange)',    value: 'var(--sapWarningColor)'     },
  { label: 'Informative (blue)', value: 'var(--sapInformativeColor)' },
  { label: 'Critical (amber)',   value: 'var(--sapCriticalColor)'    },
  { label: 'Neutral (grey)',     value: 'var(--sapNeutralColor)'     },
  { label: 'Highlight (blue)',   value: 'var(--sapHighlightColor)'   },
  { label: 'Success (green)',    value: 'var(--sapSuccessColor)'     },
]

function StatusEditor() {
  const [items,    setItems]    = useState<{ name: string; color: string }[]>([])
  const [editIdx,  setEditIdx]  = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState(SAP_TOKENS[3].value) // informative blue
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => { fetch(`${CFG_BASE}/statuses`).then(r => r.json()).then(setItems).catch(() => {}) }, [])

  async function save(updated: { name: string; color: string }[]) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${CFG_BASE}/statuses`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
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

  function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SAP_TOKENS.map(t => (
          <button
            key={t.value}
            title={t.label}
            onClick={() => onChange(t.value)}
            style={{
              width: 22, height: 22, borderRadius: 4, padding: 0, cursor: 'pointer',
              background: t.value,
              border: value === t.value ? '2px solid var(--sapTextColor)' : '2px solid transparent',
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <Section title="Interface Statuses">
      {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
      <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginBottom: 4 }}>
        Define the status lifecycle for interfaces. Colours use SAP UI5 semantic tokens and adapt to the active theme.
      </div>

      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
          {/* Live colour swatch */}
          <div style={{ width: 28, height: 20, borderRadius: 4, background: item.color, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
          {editIdx === i ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
              <Input value={editName} onInput={e => setEditName((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              <ColorPicker value={item.color} onChange={color => save(items.map((x, j) => j === i ? { ...x, color } : x))} />
            </div>
          ) : (
            <>
              <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>{item.name}</span>
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>
                {SAP_TOKENS.find(t => t.value === item.color)?.label ?? item.color}
              </span>
            </>
          )}
          <Button design="Transparent" icon="edit"    onClick={() => editIdx === i ? commitEdit(i) : startEdit(i)} disabled={saving} />
          <Button design="Transparent" icon="decline" onClick={() => editIdx === i ? setEditIdx(null) : save(items.filter((_, j) => j !== i))} />
        </div>
      ))}

      <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>Add new status</div>
        <ColorPicker value={newColor} onChange={setNewColor} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 28, height: 28, borderRadius: 4, background: newColor, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
          <Input placeholder="Status name e.g. hold" value={newName} onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
          <Button design="Emphasized" onClick={() => { if (!newName.trim()) return; save([...items, { name: newName.trim(), color: newColor }]); setNewName('') }} disabled={saving || !newName.trim()}>Add</Button>
        </div>
      </div>
    </Section>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function RegistrySettings() {
  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <StatusEditor />
      <SystemEditor />
      <SystemTypeEditor />
      <InfraTypeEditor />
      <ComponentTypeEditor />
      <IntegrationComponentEditor />
      <PlatformEditor />
    </div>
  )
}
