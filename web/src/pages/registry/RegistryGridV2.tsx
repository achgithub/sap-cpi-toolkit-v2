import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Dialog, Bar, MessageStrip } from '@ui5/webcomponents-react'
import { useRegistryApiV2 } from './useRegistryApiV2'
import ViaEditorV2 from './ViaEditorV2'
import type { InterfaceV2, ReceiverV2, TriggerType, InteractionPattern, InterfaceTypeV2, HopV2 } from './types_v2'
import {
  INTERFACE_TYPES_V2, TRIGGER_TYPES, INTERACTION_PATTERNS,
  TRANSPORTS_V2, AUTH_TYPES_V2,
  getStatusColor, TRIGGER_LABELS, PATTERN_LABELS, TYPE_LABELS_V2, SUGGESTED_PATTERN,
} from './types_v2'

const ns: React.CSSProperties = {
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
  border: '1px solid var(--sapList_BorderColor)', borderRadius: 4,
  padding: '4px 6px', background: 'var(--sapField_Background)', color: 'var(--sapTextColor)',
  width: '100%', boxSizing: 'border-box',
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>{label}</span>
      {children}
    </div>
  )
}

// ── Interface form ────────────────────────────────────────────────────────────

type IForm = {
  name: string; ref: string; build_ref: string; status: string
  interface_type: string; functional_domain: string; description: string
  logical_group_id: string; sequence_in_group: string
  trigger_type: TriggerType; trigger_system_id: string; trigger_component_id: string
  schedule_expression: string; source_system_id: string
  interaction_pattern: InteractionPattern
  api_spec_url: string; api_auth_scheme: string; api_description: string
  via: HopV2[]
}

const emptyForm = (): IForm => ({
  name: '', ref: '', build_ref: '', status: 'design',
  interface_type: 'point_to_point', functional_domain: '', description: '',
  logical_group_id: '', sequence_in_group: '',
  trigger_type: 'system_push', trigger_system_id: '', trigger_component_id: '',
  schedule_expression: '', source_system_id: '',
  interaction_pattern: 'async',
  api_spec_url: '', api_auth_scheme: '', api_description: '',
  via: [],
})

function toBody(f: IForm): Partial<InterfaceV2> {
  return {
    name: f.name, ref: f.ref || undefined, build_ref: f.build_ref,
    status: f.status as InterfaceV2['status'],
    interface_type: f.interface_type as InterfaceTypeV2,
    functional_domain: f.functional_domain, description: f.description,
    logical_group_id:  f.logical_group_id  || null,
    sequence_in_group: f.sequence_in_group ? Number(f.sequence_in_group) : null,
    trigger_type: f.trigger_type,
    trigger_system_id:    f.trigger_system_id    || null,
    trigger_component_id: f.trigger_component_id || null,
    schedule_expression:  f.schedule_expression  || null,
    source_system_id:     f.source_system_id     || null,
    interaction_pattern: f.interaction_pattern,
    via: f.via,
    api_spec_url:     f.api_spec_url     || null,
    api_auth_scheme:  f.api_auth_scheme  || null,
    api_description:  f.api_description  || null,
  }
}

function fromInterface(i: InterfaceV2): IForm {
  return {
    name: i.name, ref: i.ref, build_ref: i.build_ref, status: i.status,
    interface_type: i.interface_type, functional_domain: i.functional_domain,
    description: i.description,
    logical_group_id:  i.logical_group_id  ?? '',
    sequence_in_group: i.sequence_in_group != null ? String(i.sequence_in_group) : '',
    trigger_type: i.trigger_type,
    trigger_system_id:    i.trigger_system_id    ?? '',
    trigger_component_id: i.trigger_component_id ?? '',
    schedule_expression:  i.schedule_expression  ?? '',
    source_system_id:     i.source_system_id     ?? '',
    interaction_pattern: i.interaction_pattern,
    api_spec_url:    i.api_spec_url    ?? '',
    api_auth_scheme: i.api_auth_scheme ?? '',
    api_description: i.api_description ?? '',
    via: i.via ?? [],
  }
}

function InterfaceDialog({ open, editId, initial, api, onClose }: {
  open: boolean
  editId: string | null
  initial: IForm
  api: ReturnType<typeof useRegistryApiV2>
  onClose: () => void
}) {
  const [form,   setForm]   = useState<IForm>(initial)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => { if (open) { setForm(initial); setError('') } }, [open, initial])

  const set = (k: keyof IForm) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  function onTriggerTypeChange(tt: TriggerType) {
    setForm(p => ({ ...p, trigger_type: tt, interaction_pattern: SUGGESTED_PATTERN[tt] }))
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const body = toBody(form)
      if (editId) await api.updateInterface(editId, body)
      else        await api.createInterface(body)
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const needsTriggerSystem    = form.trigger_type === 'system_push'
  const needsTriggerComponent = form.trigger_type === 'component_scheduled' || form.trigger_type === 'component_event'
  const needsSchedule         = form.trigger_type === 'component_scheduled'
  const needsSource           = form.trigger_type === 'component_scheduled' || form.trigger_type === 'component_event'
  const isPublishedApi        = form.interface_type === 'published_api'

  return (
    <Dialog open={open} headerText={editId ? 'Edit Interface' : 'New Interface'} onClose={onClose}
      style={{ width: 560, maxWidth: '95vw' }}>
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: '70vh' }}>
        {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

        {/* Identity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
          <F label="Name *">
            <Input value={form.name} onInput={e => set('name')((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
          </F>
          <F label="Ref (auto if blank)">
            <Input value={form.ref} onInput={e => set('ref')((e.target as unknown as HTMLInputElement).value.toUpperCase().slice(0,10))}
              style={{ width: '100%', fontFamily: 'monospace' }} />
          </F>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <F label="Status">
            <select value={form.status} onChange={e => set('status')(e.target.value)} style={ns}>
              {api.config.statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </F>
          <F label="Type">
            <select value={form.interface_type} onChange={e => set('interface_type')(e.target.value)} style={ns}>
              {INTERFACE_TYPES_V2.map(t => <option key={t} value={t}>{TYPE_LABELS_V2[t]}</option>)}
            </select>
          </F>
          <F label="Build Ref">
            <Input value={form.build_ref} onInput={e => set('build_ref')((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
          </F>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <F label="Functional Domain">
            <Input value={form.functional_domain} onInput={e => set('functional_domain')((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
          </F>
          <F label="Logical Group">
            <select value={form.logical_group_id} onChange={e => set('logical_group_id')(e.target.value)} style={ns}>
              <option value="">— none —</option>
              {api.logicalGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </F>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', paddingTop: 4 }}>
          <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>Trigger &amp; Interaction</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <F label="Trigger Type">
            <select value={form.trigger_type} onChange={e => onTriggerTypeChange(e.target.value as TriggerType)} style={ns}>
              {TRIGGER_TYPES.map(t => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
            </select>
          </F>
          <F label="Interaction Pattern">
            <select value={form.interaction_pattern} onChange={e => set('interaction_pattern')(e.target.value as InteractionPattern)} style={ns}>
              {INTERACTION_PATTERNS.map(p => <option key={p} value={p}>{PATTERN_LABELS[p]}</option>)}
            </select>
          </F>
        </div>

        {needsTriggerSystem && (
          <F label="Trigger System (pushes data)">
            <select value={form.trigger_system_id} onChange={e => set('trigger_system_id')(e.target.value)} style={ns}>
              <option value="">— select system —</option>
              {api.systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </F>
        )}

        {needsTriggerComponent && (
          <F label={form.trigger_type === 'component_scheduled' ? 'Trigger Component (runs the schedule)' : 'Trigger Component (reacts to event)'}>
            <select value={form.trigger_component_id} onChange={e => set('trigger_component_id')(e.target.value)} style={ns}>
              <option value="">— select component —</option>
              {api.components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </F>
        )}

        {needsSchedule && (
          <F label="Schedule (human-readable)">
            <Input value={form.schedule_expression} placeholder="e.g. Daily 02:00 UTC, Hourly"
              onInput={e => set('schedule_expression')((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
          </F>
        )}

        {needsSource && (
          <F label="Source System (where data is read from)">
            <select value={form.source_system_id} onChange={e => set('source_system_id')(e.target.value)} style={ns}>
              <option value="">— select system —</option>
              {api.systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </F>
        )}

        {/* Published API extras */}
        {isPublishedApi && (
          <>
            <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', paddingTop: 4 }}>
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>Published API</span>
            </div>
            <F label="Spec URL (OpenAPI / Swagger)">
              <Input value={form.api_spec_url} placeholder="https://…" onInput={e => set('api_spec_url')((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
            </F>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <F label="Auth Scheme">
                <select value={form.api_auth_scheme} onChange={e => set('api_auth_scheme')(e.target.value)} style={ns}>
                  {['', 'None', 'ApiKey', 'OAuth2', 'Basic'].map(v => <option key={v} value={v}>{v || '— select —'}</option>)}
                </select>
              </F>
              <F label="API Description">
                <Input value={form.api_description} onInput={e => set('api_description')((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              </F>
            </div>
          </>
        )}

        {/* Shared via — components and api_call hops that apply to all receivers */}
        {!isPublishedApi && (
          <>
            <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', paddingTop: 4 }}>
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>
                Shared Integration Path
              </span>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginTop: 2 }}>
                Components and API call-outs that apply to all receivers. Use receiver via for hops specific to one receiver leg.
              </div>
            </div>
            <ViaEditorV2
              value={form.via}
              onChange={via => setForm(p => ({ ...p, via }))}
              components={api.components}
              systems={api.systems}
              allowCallouts={true}
            />
          </>
        )}

        <F label="Description">
          <Input value={form.description} onInput={e => set('description')((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
        </F>
      </div>
      <Bar slot="footer">
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 0.5rem' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </Bar>
    </Dialog>
  )
}

// ── Receiver panel ────────────────────────────────────────────────────────────

type RForm = { system_id: string; transport: string; auth_type: string; credential_alias: string; via: HopV2[] }
const emptyRForm = (): RForm => ({ system_id: '', transport: '', auth_type: '', credential_alias: '', via: [] })

function ReceiverPanel({ iface, api }: { iface: InterfaceV2; api: ReturnType<typeof useRegistryApiV2> }) {
  const [form,    setForm]    = useState<RForm>(emptyRForm())
  const [editId,  setEditId]  = useState<string | null>(null)
  const [dlgOpen, setDlgOpen] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  function openCreate() { setEditId(null); setForm(emptyRForm()); setError(''); setDlgOpen(true) }
  function openEdit(r: ReceiverV2) {
    setEditId(r.id)
    setForm({ system_id: r.system_id ?? '', transport: r.transport, auth_type: r.auth_type, credential_alias: r.credential_alias, via: r.via ?? [] })
    setError(''); setDlgOpen(true)
  }
  function close() { setDlgOpen(false); setEditId(null) }

  async function save() {
    setSaving(true); setError('')
    try {
      const body = { system_id: form.system_id || null, transport: form.transport, auth_type: form.auth_type, credential_alias: form.credential_alias, via: form.via }
      if (editId) await api.updateReceiver(iface.id, editId, body)
      else        await api.addReceiver(iface.id, body)
      close()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>
          Receivers ({iface.receivers.length})
        </span>
        <Button design="Transparent" icon="add" onClick={openCreate} />
      </div>

      {iface.receivers.length === 0 && (
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', padding: '4px 0' }}>No receivers.</div>
      )}

      {iface.receivers.map(r => {
        const sys = api.systems.find(s => s.id === r.system_id)
        return (
          <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
            {/* Receiver header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', fontWeight: 600 }}>
                  {sys?.name ?? '—'}
                </div>
                <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
                  {[r.transport, r.auth_type].filter(Boolean).join(' · ')}
                  {r.credential_alias && <span style={{ marginLeft: 4, opacity: 0.7 }}>· {r.credential_alias}</span>}
                </div>
              </div>
              <Button design="Transparent" icon="edit" onClick={() => openEdit(r)} />
              <Button design="Transparent" icon="delete" onClick={() => api.deleteReceiver(iface.id, r.id)} />
            </div>

            {/* Additional component hops on this receiver leg */}
            {r.via.length > 0 && (
              <div style={{ marginTop: 6, paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {r.via.map((hop, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.65rem', fontWeight: 600, padding: '1px 5px', borderRadius: 8, flexShrink: 0, background: 'var(--sapHighlightColor)', color: '#fff' }}>
                      HOP
                    </span>
                    <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>
                      {hop.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <Dialog open={dlgOpen} headerText={editId ? 'Edit Receiver' : 'Add Receiver'} onClose={close} style={{ width: 440, maxWidth: '95vw' }}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <F label="Receiver System">
            <select value={form.system_id} onChange={e => setForm(p => ({ ...p, system_id: e.target.value }))} style={ns}>
              <option value="">— select system —</option>
              {api.systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <F label="Transport">
              <select value={form.transport} onChange={e => setForm(p => ({ ...p, transport: e.target.value }))} style={ns}>
                {TRANSPORTS_V2.map(t => <option key={t} value={t}>{t || '— select —'}</option>)}
              </select>
            </F>
            <F label="Auth Type">
              <select value={form.auth_type} onChange={e => setForm(p => ({ ...p, auth_type: e.target.value }))} style={ns}>
                {AUTH_TYPES_V2.map(a => <option key={a} value={a}>{a || '— select —'}</option>)}
              </select>
            </F>
          </div>
          <F label="Credential Alias">
            <Input value={form.credential_alias} onInput={e => setForm(p => ({ ...p, credential_alias: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </F>
          <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', paddingTop: 4 }}>
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>
              Receiver Via Hops
            </span>
            <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginTop: 2 }}>
              Additional integration component hops specific to this receiver leg, after the last shared hop.
            </div>
          </div>
          <ViaEditorV2
            value={form.via}
            onChange={via => setForm(p => ({ ...p, via }))}
            components={api.components}
            systems={api.systems}
            allowCallouts={false}
          />
        </div>
        <Bar slot="footer">
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={close}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </Bar>
      </Dialog>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ iface, api, onEdit, onArchive, onClose, onStatusChange }: {
  iface: InterfaceV2
  api: ReturnType<typeof useRegistryApiV2>
  onEdit: () => void
  onArchive: () => void
  onClose: () => void
  onStatusChange: (s: string) => void
}) {
  const triggerSys  = api.systems.find(s => s.id === iface.trigger_system_id)
  const triggerComp = api.components.find(c => c.id === iface.trigger_component_id)
  const sourceSys   = api.systems.find(s => s.id === iface.source_system_id)
  const group       = api.logicalGroups.find(g => g.id === iface.logical_group_id)

  const rows: [string, string][] = [
    ['Type',    TYPE_LABELS_V2[iface.interface_type] ?? iface.interface_type],
    ['Status',  iface.status],
    ['Trigger', TRIGGER_LABELS[iface.trigger_type] ?? iface.trigger_type],
    ...(triggerSys  ? [['Trigger System', triggerSys.name] as [string, string]] : []),
    ...(triggerComp ? [['Trigger Component', triggerComp.name] as [string, string]] : []),
    ...(iface.schedule_expression ? [['Schedule', iface.schedule_expression] as [string, string]] : []),
    ...(sourceSys   ? [['Source System', sourceSys.name] as [string, string]] : []),
    ['Pattern', PATTERN_LABELS[iface.interaction_pattern] ?? iface.interaction_pattern],
    ...(iface.functional_domain ? [['Domain', iface.functional_domain] as [string, string]] : []),
    ...(group ? [['Group', group.name] as [string, string]] : []),
    ...(iface.build_ref ? [['Build Ref', iface.build_ref] as [string, string]] : []),
  ]

  return (
    <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_ContentBackground)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iface.name}</div>
          <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>{iface.ref}</code>
        </div>
        <Button design="Transparent" icon="edit"    title="Edit"    onClick={onEdit} />
        <Button design="Transparent" icon="away"    title="Archive" onClick={onArchive} />
        <Button design="Transparent" icon="decline" title="Close"   onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Status — quick update from detail panel too */}
        <div style={{ marginBottom: 4 }}>
          <StatusPill iface={iface} statuses={api.config.statuses} onUpdate={onStatusChange} />
        </div>

        {/* Metadata rows */}
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 8, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: 130, flexShrink: 0 }}>{label}</span>
            <span style={{ color: 'var(--sapTextColor)' }}>{value}</span>
          </div>
        ))}

        {iface.description && (
          <div style={{ marginTop: 4, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {iface.description}
          </div>
        )}

        {/* Shared via hops */}
        {iface.via.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', marginBottom: 6 }}>
              Shared Integration Path
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {iface.via.map((hop, i) => (
                <div key={i}>
                  {/* Component hop pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>↓</span>}
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: 'var(--sapHighlightColor)', color: '#fff', fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600 }}>
                      {hop.label}
                    </span>
                  </div>
                  {/* Callouts nested under this hop */}
                  {(hop.callouts ?? []).map((c, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 4, marginLeft: 16 }}>
                      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.65rem', fontWeight: 600, padding: '1px 5px', borderRadius: 8, background: 'var(--sapWarningColor)', color: '#fff', flexShrink: 0, marginTop: 2 }}>
                        API
                      </span>
                      <div>
                        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>{c.label}</div>
                        {c.system_label && (
                          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>→ {c.system_label}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Published API extras */}
        {iface.interface_type === 'published_api' && (iface.api_spec_url || iface.api_auth_scheme || iface.api_description) && (
          <div style={{ marginTop: 4, padding: 8, border: '1px solid var(--sapList_BorderColor)', borderRadius: 4, background: 'var(--sapGroup_ContentBackground)' }}>
            <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', marginBottom: 6 }}>Published API</div>
            {iface.api_auth_scheme && (
              <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', marginBottom: 4 }}>
                <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: 80, flexShrink: 0 }}>Auth</span>
                <span style={{ color: 'var(--sapTextColor)' }}>{iface.api_auth_scheme}</span>
              </div>
            )}
            {iface.api_description && (
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', lineHeight: 1.5 }}>{iface.api_description}</div>
            )}
            {iface.api_spec_url && (
              <a href={iface.api_spec_url} target="_blank" rel="noreferrer"
                style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapLinkColor, var(--sapHighlightColor))', display: 'block', marginTop: 4, wordBreak: 'break-all' }}>
                View Spec ↗
              </a>
            )}
          </div>
        )}

        {/* Receivers */}
        <ReceiverPanel iface={iface} api={api} />
      </div>
    </div>
  )
}

// ── Status pill with quick-update popover ────────────────────────────────────

function StatusPill({ iface, statuses, onUpdate }: {
  iface:    InterfaceV2
  statuses: import('./types_v2').StatusConfig[]
  onUpdate: (status: string) => void
}) {
  const [open, setOpen] = useState(false)
  const color = getStatusColor(iface.status, statuses)

  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <span
        onClick={() => setOpen(p => !p)}
        title="Click to change status"
        style={{
          display: 'block', padding: '2px 6px', borderRadius: 8,
          fontSize: '0.7rem', fontFamily: 'var(--sapFontFamily)',
          background: color, color: '#fff',
          textAlign: 'center', cursor: 'pointer', userSelect: 'none',
          boxShadow: open ? '0 0 0 2px var(--sapTextColor)' : undefined,
        }}
      >
        {iface.status}
      </span>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            zIndex: 100, background: 'var(--sapGroup_ContentBackground)',
            border: '1px solid var(--sapList_BorderColor)', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 120, overflow: 'hidden',
          }}>
            {statuses.filter(s => s.name !== iface.status).map(s => (
              <div
                key={s.name}
                onClick={() => { onUpdate(s.name); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', cursor: 'pointer',
                  fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
                  color: 'var(--sapTextColor)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sapList_Hover_Background)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                {s.name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main grid ─────────────────────────────────────────────────────────────────

export default function RegistryGridV2() {
  const api = useRegistryApiV2()
  const [showArchived,   setShowArchived]   = useState(false)
  useEffect(() => { api.load(showArchived) }, [showArchived]) // eslint-disable-line react-hooks/exhaustive-deps

  const [search,         setSearch]         = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterType,     setFilterType]     = useState('')
  const [filterTrigger,  setFilterTrigger]  = useState('')
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [dlgOpen,        setDlgOpen]        = useState(false)
  const [editIface,      setEditIface]      = useState<InterfaceV2 | null>(null)
  const [archiveTarget,  setArchiveTarget]  = useState<InterfaceV2 | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return api.interfaces.filter(i =>
      (!q || i.name.toLowerCase().includes(q) || i.ref.toLowerCase().includes(q) || i.functional_domain.toLowerCase().includes(q)) &&
      (!filterStatus  || i.status === filterStatus) &&
      (!filterType    || i.interface_type === filterType) &&
      (!filterTrigger || i.trigger_type === filterTrigger)
    )
  }, [api.interfaces, search, filterStatus, filterType, filterTrigger])

  const selected = selectedId ? api.interfaces.find(i => i.id === selectedId) ?? null : null

  function openCreate() { setEditIface(null); setDlgOpen(true) }
  function openEdit(i: InterfaceV2) { setEditIface(i); setDlgOpen(true) }
  function closeDlg() { setDlgOpen(false); setEditIface(null) }

  async function confirmArchive() {
    if (!archiveTarget) return
    await api.archiveInterface(archiveTarget.id)
    if (selectedId === archiveTarget.id) setSelectedId(null)
    setArchiveTarget(null)
  }

  async function quickStatus(iface: InterfaceV2, status: string) {
    await api.updateInterface(iface.id, { ...iface, status: status as InterfaceV2['status'] })
  }

  const col: React.CSSProperties = { fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }
  const cell: React.CSSProperties = { fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const grid = '90px 2fr 120px 110px 90px 80px 48px'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* List */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0, flexWrap: 'wrap' }}>
          <Input placeholder="Search…" value={search} showClearIcon style={{ width: 200 }}
            onInput={e => setSearch((e.target as unknown as HTMLInputElement).value)} />

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: 4, padding: '4px 6px', background: 'var(--sapField_Background)', color: 'var(--sapTextColor)' }}>
            <option value="">All statuses</option>
            {api.config.statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>

          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: 4, padding: '4px 6px', background: 'var(--sapField_Background)', color: 'var(--sapTextColor)' }}>
            <option value="">All types</option>
            {INTERFACE_TYPES_V2.map(t => <option key={t} value={t}>{TYPE_LABELS_V2[t]}</option>)}
          </select>

          <select value={filterTrigger} onChange={e => setFilterTrigger(e.target.value)}
            style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: 4, padding: '4px 6px', background: 'var(--sapField_Background)', color: 'var(--sapTextColor)' }}>
            <option value="">All triggers</option>
            {TRIGGER_TYPES.map(t => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
          </select>

          <span style={{ marginLeft: 'auto', ...col }}>{filtered.length} of {api.interfaces.length}</span>
          <Button
            design={showArchived ? 'Attention' : 'Transparent'}
            icon="away"
            onClick={() => setShowArchived(p => !p)}
          >
            {showArchived ? 'Hiding archived' : 'Show archived'}
          </Button>
          <Button design="Emphasized" icon="add" onClick={openCreate}>New Interface</Button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '0 12px', padding: '6px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
          {['Ref', 'Interface', 'Type', 'Trigger', 'Pattern', 'Status', ''].map(h => (
            <span key={h} style={col}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {api.loading && <div style={{ padding: '2rem', textAlign: 'center', ...col }}>Loading…</div>}
          {api.error && <div style={{ padding: '1rem' }}><MessageStrip design="Negative" hideCloseButton>{api.error}</MessageStrip></div>}
          {!api.loading && filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', ...col }}>
              {api.interfaces.length === 0 ? 'No interfaces yet. Use New Interface to add one.' : 'No interfaces match the filters.'}
            </div>
          )}
          {filtered.map(iface => {
            const isSel = selectedId === iface.id
            return (
              <div key={iface.id}
                onClick={() => setSelectedId(p => p === iface.id ? null : iface.id)}
                style={{ display: 'grid', gridTemplateColumns: grid, gap: '0 12px', padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--sapList_BorderColor)', background: isSel ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent', alignItems: 'center' }}>
                <code style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>{iface.ref}</code>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ ...cell, fontWeight: 600 }}>{iface.name}</div>
                  {iface.functional_domain && <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>{iface.functional_domain}</div>}
                </div>
                <span style={cell}>{TYPE_LABELS_V2[iface.interface_type] ?? iface.interface_type}</span>
                <span style={{ ...cell, fontSize: '0.72rem' }}>{TRIGGER_LABELS[iface.trigger_type] ?? iface.trigger_type}</span>
                <span style={{ ...cell, fontSize: '0.72rem' }}>{PATTERN_LABELS[iface.interaction_pattern] ?? iface.interaction_pattern}</span>
                <StatusPill iface={iface} statuses={api.config.statuses} onUpdate={s => quickStatus(iface, s)} />
                <div onClick={e => e.stopPropagation()}>
                  <Button design="Transparent" icon="away" title="Archive this interface" onClick={() => setArchiveTarget(iface)} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          iface={selected}
          api={api}
          onEdit={() => openEdit(selected)}
          onArchive={() => setArchiveTarget(selected)}
          onClose={() => setSelectedId(null)}
          onStatusChange={s => quickStatus(selected, s)}
        />
      )}

      {/* Create / Edit dialog */}
      <InterfaceDialog
        open={dlgOpen}
        editId={editIface?.id ?? null}
        initial={editIface ? fromInterface(editIface) : emptyForm()}
        api={api}
        onClose={closeDlg}
      />

      {/* Archive confirmation */}
      <Dialog
        open={!!archiveTarget}
        headerText="Archive Interface"
        onClose={() => setArchiveTarget(null)}
        style={{ width: 420 }}
      >
        <div style={{ padding: '1rem', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapTextColor)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>
            Archive <strong>{archiveTarget?.name}</strong>?
          </p>
          <p style={{ margin: 0, color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem' }}>
            This interface will be hidden from all views. It is not deleted — an administrator can restore or permanently remove it later.
          </p>
        </div>
        <Bar slot="footer">
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <Button design="Negative" onClick={confirmArchive}>Archive</Button>
          </div>
        </Bar>
      </Dialog>
    </div>
  )
}
