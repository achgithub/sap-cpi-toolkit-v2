import { useEffect, useMemo, useState } from 'react'
import { useRegistryApi } from './useRegistryApi'
import type { System } from './types'
import { OWNER_TYPES } from './types'

// ── Form ──────────────────────────────────────────────────────────────────────

const emptyForm = (): Partial<System> => ({
  name: '', system_type: '', infra_type: '',
  infra_region: '', description: '', owner_type: 'internal',
})

function SystemForm({
  initial, config, onSave, onCancel, onDelete,
}: {
  initial:   Partial<System>
  config:    { systemTypes: { name: string }[]; infraTypes: { name: string }[] }
  onSave:    (body: Partial<System>) => Promise<void>
  onCancel:  () => void
  onDelete?: () => Promise<void>
}) {
  const [form,   setForm]   = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function save() {
    if (!form.name?.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try { await onSave(form) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error saving') }
    finally { setSaving(false) }
  }

  async function del() {
    if (!onDelete) return
    if (!confirm('Delete this system? Any interface links will be cleared.')) return
    setSaving(true)
    try { await onDelete() }
    catch (e) { setError(e instanceof Error ? e.message : 'Error deleting') }
    finally { setSaving(false) }
  }

  const F = fieldStyle

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {error && (
        <div style={{ padding: '8px 12px', background: '#c0392b', color: '#fff', borderRadius: '4px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.82rem', fontWeight: 600, borderLeft: '4px solid #922b21' }}>
          ⚠ {error}
        </div>
      )}

      <Field label="Name *">
        <input style={F} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="System name" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Field label="System Type">
          <input style={F} list="sys-types" value={form.system_type ?? ''} onChange={e => setForm(f => ({ ...f, system_type: e.target.value }))} placeholder="e.g. SAP S/4HANA" />
          <datalist id="sys-types">{config.systemTypes.map(t => <option key={t.name} value={t.name} />)}</datalist>
        </Field>
        <Field label="Owner Type">
          <select style={F} value={form.owner_type ?? 'internal'} onChange={e => setForm(f => ({ ...f, owner_type: e.target.value }))}>
            {OWNER_TYPES.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Infra Type">
          <input style={F} list="infra-types" value={form.infra_type ?? ''} onChange={e => setForm(f => ({ ...f, infra_type: e.target.value }))} placeholder="e.g. On-Prem, AWS" />
          <datalist id="infra-types">{config.infraTypes.map(t => <option key={t.name} value={t.name} />)}</datalist>
        </Field>
        <Field label="Infra Region">
          <input style={F} value={form.infra_region ?? ''} onChange={e => setForm(f => ({ ...f, infra_region: e.target.value }))} placeholder="e.g. eu-west-1" />
        </Field>
      </div>

      <Field label="Description">
        <textarea style={{ ...F, height: '64px', resize: 'vertical' }} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginTop: '4px' }}>
        {onDelete
          ? <button style={btnStyle('negative')} onClick={del} disabled={saving}>Delete</button>
          : <span />}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={btnStyle('default')} onClick={onCancel}>Cancel</button>
          <button style={btnStyle('primary')} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ── System row ────────────────────────────────────────────────────────────────

function SystemRow({
  system, ifaceCount, selected, onClick,
}: {
  system:     System
  ifaceCount: number
  selected:   boolean
  onClick:    () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 130px 130px 100px 60px 60px',
        gap: '0 12px', padding: '8px 12px', cursor: 'pointer',
        borderBottom: '1px solid var(--sapList_BorderColor)',
        background: selected ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
        alignItems: 'center',
      }}
    >
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {system.name}
        </div>
        {system.description && (
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {system.description}
          </div>
        )}
      </div>
      <Cell>{system.system_type || '—'}</Cell>
      <Cell>{[system.infra_type, system.infra_region].filter(Boolean).join(' · ') || '—'}</Cell>
      <Cell>{system.owner_type}</Cell>
      <Cell>{ifaceCount > 0 ? ifaceCount : '—'}</Cell>
      <Cell>{system.owner_type === 'internal' ? '●' : '○'}</Cell>
    </div>
  )
}

// ── Detail / edit panel ───────────────────────────────────────────────────────

function SystemPanel({
  system, api, onClose,
}: {
  system: System
  api:    ReturnType<typeof useRegistryApi>
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)

  const ifacesAsSource = api.interfaces.filter(i => i.sender_system_id === system.id)
  const ifacesAsTarget = api.interfaces.filter(i => i.receivers.some(r => r.system_id === system.id))

  if (editing) {
    return (
      <Panel title={system.name} onClose={onClose}>
        <SystemForm
          initial={{ ...system }}

          config={api.config}
          onSave={async body => { await api.updateSystem(system.id, body); setEditing(false) }}
          onCancel={() => setEditing(false)}
          onDelete={async () => { await api.deleteSystem(system.id); onClose() }}
        />
      </Panel>
    )
  }

  return (
    <Panel title={system.name} onClose={onClose} action={
      <button style={btnStyle('default')} onClick={() => setEditing(true)}>Edit</button>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <InfoRow label="Type">{system.system_type || '—'}</InfoRow>
        <InfoRow label="Infra">{[system.infra_type, system.infra_region].filter(Boolean).join(' · ') || '—'}</InfoRow>
        <InfoRow label="Owner">{system.owner_type}</InfoRow>
        {system.description && <InfoRow label="Description">{system.description}</InfoRow>}

        {ifacesAsSource.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <SectionLabel>Sends ({ifacesAsSource.length})</SectionLabel>
            {ifacesAsSource.map(i => <IfaceChip key={i.id} iface={i} />)}
          </div>
        )}
        {ifacesAsTarget.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <SectionLabel>Receives ({ifacesAsTarget.length})</SectionLabel>
            {ifacesAsTarget.map(i => <IfaceChip key={i.id} iface={i} />)}
          </div>
        )}
        {ifacesAsSource.length === 0 && ifacesAsTarget.length === 0 && (
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', marginTop: '8px' }}>
            No interfaces registered for this system.
          </div>
        )}
      </div>
    </Panel>
  )
}

function IfaceChip({ iface }: { iface: { ref: string; name: string; status: string } }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--sapList_BorderColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>
      <code style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>{iface.ref}</code>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--sapTextColor)' }}>{iface.name}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SystemView() {
  const api = useRegistryApi()
  const [search,     setSearch]     = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating,   setCreating]   = useState(false)

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Count interfaces per system
  const ifaceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    api.interfaces.forEach(i => {
      if (i.sender_system_id) counts[i.sender_system_id] = (counts[i.sender_system_id] ?? 0) + 1
      i.receivers.forEach(r => {
        if (r.system_id) counts[r.system_id] = (counts[r.system_id] ?? 0) + 1
      })
    })
    return counts
  }, [api.interfaces])

  const filtered = useMemo(() => {
    if (!search) return api.systems
    const q = search.toLowerCase()
    return api.systems.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.system_type.toLowerCase().includes(q) ||
      s.infra_type.toLowerCase().includes(q)
    )
  }, [api.systems, search])

  const selected = selectedId ? api.systems.find(s => s.id === selectedId) ?? null : null

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* List */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0 }}>
          <input
            placeholder="Search systems…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)', borderRadius: '14px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', background: 'var(--sapBackgroundColor)', color: 'var(--sapTextColor)', width: '200px' }}
          />
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
            {filtered.length} of {api.systems.length}
          </span>
          <button style={btnStyle('primary')} onClick={() => { setSelectedId(null); setCreating(true) }}>
            + New System
          </button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 100px 60px 60px', gap: '0 12px', padding: '6px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
          {['Name', 'Type', 'Infra', 'Owner', 'IFs', 'Int.'].map(h => (
            <span key={h} style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {api.loading && <Loading />}
          {!api.loading && filtered.length === 0 && (
            <Empty>{api.systems.length === 0 ? 'No systems yet — click New System to add one.' : 'No systems match the search.'}</Empty>
          )}
          {filtered.map(s => (
            <SystemRow
              key={s.id}
              system={s}
              ifaceCount={ifaceCounts[s.id] ?? 0}
              selected={selectedId === s.id}
              onClick={() => { setCreating(false); setSelectedId(prev => prev === s.id ? null : s.id) }}
            />
          ))}
        </div>
      </div>

      {/* Create panel */}
      {creating && (
        <Panel title="New System" onClose={() => setCreating(false)}>
          <SystemForm
            initial={emptyForm()}
  
            config={api.config}
            onSave={async body => { await api.createSystem(body); setCreating(false) }}
            onCancel={() => setCreating(false)}
          />
        </Panel>
      )}

      {/* Detail / edit panel */}
      {selected && !creating && (
        <SystemPanel
          system={selected}
          api={api}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <label style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}

function Panel({ title, children, onClose, action }: { title: string; children: React.ReactNode; onClose: () => void; action?: React.ReactNode }) {
  return (
    <div style={{ width: '360px', flexShrink: 0, borderLeft: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_ContentBackground)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>{title}</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {action}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--sapTextColor)', lineHeight: 1 }}>✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>{children}</div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>
      <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: '80px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--sapTextColor)' }}>{children}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', marginBottom: '4px' }}>{children}</div>
}

function Cell({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
}

function Loading() {
  return <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>Loading…</div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>{children}</div>
}

const fieldStyle: React.CSSProperties = {
  padding: '5px 8px', border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px',
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
  background: 'var(--sapBackgroundColor)', color: 'var(--sapTextColor)', width: '100%', boxSizing: 'border-box',
}

function btnStyle(variant: 'primary' | 'default' | 'negative'): React.CSSProperties {
  const bg = variant === 'primary' ? 'var(--sapHighlightColor)' : variant === 'negative' ? 'var(--sapNegativeColor)' : 'transparent'
  return {
    padding: '5px 14px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.8rem',
    fontFamily: 'var(--sapFontFamily)', border: `1px solid ${variant === 'default' ? 'var(--sapList_BorderColor)' : bg}`,
    background: bg, color: variant === 'default' ? 'var(--sapTextColor)' : '#fff',
  }
}
