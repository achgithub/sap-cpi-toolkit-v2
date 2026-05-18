import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Input, Select, Option, TextArea, Label,
  MessageStrip, Dialog, Bar,
} from '@ui5/webcomponents-react'
import { useRegistryApi } from './useRegistryApi'
import type { Interface, Receiver, System, ViaHop, PlatformConfig } from './types'
import { STATUS_COLORS, TYPE_LABELS, STATUSES, INTERFACE_TYPES, TRANSPORTS, AUTH_TYPES } from './types'

interface Props {
  initialSenderSystemId?:   string
  initialReceiverSystemId?: string
  initialIfaceId?:          string
  onBack?: () => void
}

// Helper: read value from a UI5 Select onChange event.
// UI5's SelectChangeEventDetail.selectedOption is a web component element; .value gives its value.
function selVal(e: unknown): string {
  return ((e as any)?.detail?.selectedOption?.value as string | undefined) ?? ''
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
// Uses UI5 Label (Fiori-spec font, colon, required marker) above the control.

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <Label required={required}>{label}</Label>
      {children}
    </div>
  )
}

// ── ViaEditor ────────────────────────────────────────────────────────────────
// Uses native <select> for the "pick-and-reset" pickers deliberately:
// the controlled-reset pattern (select item → immediately return to placeholder)
// maps to native <select value=""> more reliably than UI5 Select.
// All other interactive elements in this file use UI5 components.

const pickerSelect: React.CSSProperties = {
  padding: '5px 8px', border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px',
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
  background: 'var(--sapField_Background)', color: 'var(--sapTextColor)',
  boxSizing: 'border-box',
}

function ViaEditor({ value, onChange, platforms = [], systems = [] }: {
  value:     ViaHop[]
  onChange:  (v: ViaHop[]) => void
  platforms?: PlatformConfig[]
  systems?:  System[]
}) {
  function addSystem(sysId: string) {
    const sys = systems.find(s => s.id === sysId)
    if (!sys) return
    onChange([...value, { label: sys.name, system_id: sysId }])
  }

  function addPlatform(label: string) {
    const l = label.trim()
    if (!l) return
    onChange([...value, { label: l }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {value.map((hop, i) => {
            const color    = platforms.find(p => p.name === hop.label)?.color
            const isLinked = !!hop.system_id
            return (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '2px 8px', borderRadius: '12px',
                background: isLinked ? '#1B5E20' : (color ?? 'var(--sapHighlightColor)'),
                color: '#fff', fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
              }}>
                {i > 0 && <span style={{ opacity: 0.7, marginRight: 2 }}>→</span>}
                {hop.label}
                {isLinked && <span style={{ opacity: 0.7, fontSize: '0.65rem' }}>✓</span>}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, fontSize: '0.75rem', lineHeight: 1, opacity: 0.8 }}
                >×</button>
              </span>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <select style={{ ...pickerSelect, flex: 2, minWidth: 140 }} value="" onChange={e => { if (e.target.value) addSystem(e.target.value) }}>
          <option value="">+ System (linked)</option>
          {[...systems].sort((a, b) => a.name.localeCompare(b.name)).map(s => (
            <option key={s.id} value={s.id}>
              {s.system_type && s.system_type !== s.name ? `${s.name} (${s.system_type})` : s.name}
            </option>
          ))}
        </select>
        {platforms.length > 0 && (
          <select style={{ ...pickerSelect, flex: 1, minWidth: 100 }} value="" onChange={e => { if (e.target.value) addPlatform(e.target.value) }}>
            <option value="">+ Platform label</option>
            {platforms.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

function ViaPath({ via }: { via: ViaHop[] }) {
  if (!via.length) return null
  return <>{via.map(h => h.label).join(' → ')}</>
}

// ── Interface form (create + edit) ────────────────────────────────────────────

type IfaceFormData = {
  name: string; ref: string; build_ref: string; status: string; interface_type: string
  sender_system_id: string; logical_group_id: string
  sequence_in_group: string; sender_step_label: string; receiver_step_label: string
  functional_domain: string; via: ViaHop[]; description: string
}

const emptyIfaceForm = (): IfaceFormData => ({
  name: '', ref: '', build_ref: '', status: 'design', interface_type: 'point_to_point',
  sender_system_id: '', logical_group_id: '',
  sequence_in_group: '', sender_step_label: '', receiver_step_label: '',
  functional_domain: '', via: [], description: '',
})

function fromInterface(i: Interface): IfaceFormData {
  return {
    name: i.name, ref: i.ref.trim(), build_ref: i.build_ref, status: i.status,
    interface_type: i.interface_type,
    sender_system_id:   i.sender_system_id  ?? '',
    logical_group_id:   i.logical_group_id  ?? '',
    sequence_in_group:  i.sequence_in_group != null ? String(i.sequence_in_group) : '',
    sender_step_label:  i.sender_step_label,
    receiver_step_label: i.receiver_step_label,
    functional_domain:  i.functional_domain,
    via:                i.via ?? [],
    description:        i.description,
  }
}

function toBody(f: IfaceFormData): Partial<Interface> {
  return {
    name: f.name, ref: f.ref || undefined, build_ref: f.build_ref,
    status:         f.status as Interface['status'],
    interface_type: f.interface_type as Interface['interface_type'],
    sender_system_id:    f.sender_system_id   || null,
    logical_group_id:    f.logical_group_id   || null,
    sequence_in_group:   f.sequence_in_group ? parseInt(f.sequence_in_group) : null,
    sender_step_label:   f.sender_step_label,
    receiver_step_label: f.receiver_step_label,
    functional_domain:   f.functional_domain,
    via:                 f.via,
    description:         f.description,
  }
}

function GroupField({ form, setForm, api }: {
  form:    IfaceFormData
  setForm: React.Dispatch<React.SetStateAction<IfaceFormData>>
  api:     ReturnType<typeof useRegistryApi>
}) {
  const [adding,    setAdding]    = useState(false)
  const [groupName, setGroupName] = useState('')
  const [saving,    setSaving]    = useState(false)

  async function createGroup() {
    if (!groupName.trim()) return
    setSaving(true)
    try {
      const g = await api.createLogicalGroup({ name: groupName.trim(), description: '' })
      setForm(f => ({ ...f, logical_group_id: g.id }))
      setAdding(false)
      setGroupName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Field label="Logical Group">
      <div style={{ display: 'flex', gap: '4px' }}>
        <Select
          value={form.logical_group_id}
          style={{ flex: 1 } as React.CSSProperties}
          onChange={e => setForm(f => ({ ...f, logical_group_id: selVal(e) }))}
        >
          <Option value="">— standalone —</Option>
          {api.logicalGroups.map(g => (
            <Option key={g.id} value={g.id} selected={form.logical_group_id === g.id}>{g.name}</Option>
          ))}
        </Select>
        <Button icon="add" onClick={() => setAdding(a => !a)} title="New group" />
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
          <Input
            style={{ flex: 1 } as React.CSSProperties}
            autoFocus
            value={groupName}
            placeholder="Group name"
            onInput={e => setGroupName((e.target as unknown as HTMLInputElement).value)}
            onKeyDown={e => {
              if ((e as any).key === 'Enter') createGroup()
              if ((e as any).key === 'Escape') setAdding(false)
            }}
          />
          <Button design="Emphasized" onClick={createGroup} disabled={saving}>
            {saving ? '…' : 'Add'}
          </Button>
        </div>
      )}
    </Field>
  )
}

function InterfaceForm({
  initial, api, onSave, onCancel, onDelete,
}: {
  initial:   IfaceFormData
  api:       ReturnType<typeof useRegistryApi>
  onSave:    (body: ReturnType<typeof toBody>) => Promise<void>
  onCancel:  () => void
  onDelete?: () => Promise<void>
}) {
  const [form,          setForm]          = useState(initial)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try { await onSave(toBody(form)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error saving') }
    finally { setSaving(false) }
  }

  async function del() {
    if (!onDelete) return
    setSaving(true)
    try { await onDelete() }
    catch (e) { setError(e instanceof Error ? e.message : 'Error deleting') }
    finally { setSaving(false); setConfirmDelete(false) }
  }

  const refHasError = error.toLowerCase().includes('ref')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {error && (
        <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>
      )}

      <Field label="Name" required>
        <Input
          value={form.name}
          placeholder="Interface name"
          style={{ width: '100%' } as React.CSSProperties}
          onInput={e => setForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))}
        />
      </Field>

      <Field label="Ref">
        <Input
          value={form.ref}
          maxlength={10}
          placeholder="Auto-generated if blank (e.g. RICEF-001)"
          valueState={refHasError ? 'Negative' : 'None'}
          style={{ width: '100%' } as React.CSSProperties}
          onInput={e => {
            setError('')
            setForm(f => ({ ...f, ref: (e.target as unknown as HTMLInputElement).value.toUpperCase() }))
          }}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Field label="Status">
          <Select
            style={{ width: '100%' } as React.CSSProperties}
            onChange={e => setForm(f => ({ ...f, status: selVal(e) }))}
          >
            {STATUSES.map(s => (
              <Option key={s} value={s} selected={form.status === s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select
            style={{ width: '100%' } as React.CSSProperties}
            onChange={e => setForm(f => ({ ...f, interface_type: selVal(e) }))}
          >
            {INTERFACE_TYPES.map(t => (
              <Option key={t} value={t} selected={form.interface_type === t}>{TYPE_LABELS[t]}</Option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Build Ref">
        <Input
          value={form.build_ref}
          placeholder="RICEF-001 / JIRA-1234"
          style={{ width: '100%' } as React.CSSProperties}
          onInput={e => setForm(f => ({ ...f, build_ref: (e.target as unknown as HTMLInputElement).value }))}
        />
      </Field>

      <Field label="Sender System">
        <Select
          style={{ width: '100%' } as React.CSSProperties}
          onChange={e => setForm(f => ({ ...f, sender_system_id: selVal(e) }))}
        >
          <Option value="" selected={!form.sender_system_id}>— none —</Option>
          {api.systems.map(s => (
            <Option key={s.id} value={s.id} selected={form.sender_system_id === s.id}>{s.name}</Option>
          ))}
        </Select>
      </Field>

      <GroupField form={form} setForm={setForm} api={api} />

      <Field label="Functional Domain">
        <Input
          value={form.functional_domain}
          placeholder="Order to Cash / Finance / Logistics"
          style={{ width: '100%' } as React.CSSProperties}
          onInput={e => setForm(f => ({ ...f, functional_domain: (e.target as unknown as HTMLInputElement).value }))}
        />
      </Field>

      <Field label="Via (shared hops for all receivers)">
        <ViaEditor
          value={form.via}
          onChange={via => setForm(f => ({ ...f, via }))}
          platforms={api.config.platforms}
          systems={api.systems}
        />
        <div style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', marginTop: '2px' }}>
          e.g. SAP CPI → SFTP Server. Add per-receiver hops on the Receivers tab.
        </div>
      </Field>

      <Field label="Description">
        <TextArea
          value={form.description}
          rows={3}
          growing
          style={{ width: '100%' } as React.CSSProperties}
          onInput={e => setForm(f => ({ ...f, description: (e.target as unknown as HTMLTextAreaElement).value }))}
        />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', marginTop: '4px' }}>
        {onDelete
          ? <Button design="Negative" disabled={saving} onClick={() => setConfirmDelete(true)}>Delete</Button>
          : <span />
        }
        <div style={{ display: 'flex', gap: '6px' }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button design="Emphasized" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Delete confirmation — UI5 Dialog portals to document.body, so parent overflow:hidden won't clip it */}
      <Dialog
        open={confirmDelete}
        headerText="Delete Interface"
        onClose={() => setConfirmDelete(false)}
        style={{ width: '400px' }}
      >
        <div style={{ padding: '1rem' }}>
          <MessageStrip design="Negative" hideCloseButton>
            This will permanently delete the interface and all its receivers. This cannot be undone.
          </MessageStrip>
        </div>
        <Bar slot="footer">
          <div slot="endContent" style={{ display: 'flex', gap: '0.5rem' }}>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button design="Negative" disabled={saving} onClick={del}>
              {saving ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </Bar>
      </Dialog>
    </div>
  )
}

// ── Receiver row ──────────────────────────────────────────────────────────────

function ReceiverRow({
  rec, systems, platforms, onUpdate, onDelete,
}: {
  rec:      Receiver
  systems:  System[]
  platforms: PlatformConfig[]
  onUpdate: (body: Partial<Receiver>) => Promise<unknown>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    system_id:        rec.system_id ?? '',
    transport:        rec.transport,
    auth_type:        rec.auth_type,
    credential_alias: rec.credential_alias,
    via:              rec.via ?? [] as ViaHop[],
  })

  if (editing) {
    return (
      <div style={{
        padding: '8px', border: '1px solid var(--sapList_BorderColor)',
        borderRadius: '4px', marginBottom: '6px',
        display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
        <Select
          style={{ width: '100%' } as React.CSSProperties}
          onChange={e => setForm(f => ({ ...f, system_id: selVal(e) }))}
        >
          <Option value="" selected={!form.system_id}>— no system —</Option>
          {systems.map(s => (
            <Option key={s.id} value={s.id} selected={form.system_id === s.id}>{s.name}</Option>
          ))}
        </Select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <Select
            style={{ width: '100%' } as React.CSSProperties}
            onChange={e => setForm(f => ({ ...f, transport: selVal(e) }))}
          >
            {TRANSPORTS.map(t => (
              <Option key={t} value={t} selected={form.transport === t}>{t || '—'}</Option>
            ))}
          </Select>
          <Select
            style={{ width: '100%' } as React.CSSProperties}
            onChange={e => setForm(f => ({ ...f, auth_type: selVal(e) }))}
          >
            {AUTH_TYPES.map(a => (
              <Option key={a} value={a} selected={form.auth_type === a}>{a || '—'}</Option>
            ))}
          </Select>
        </div>
        <Input
          value={form.credential_alias}
          placeholder="Credential alias"
          style={{ width: '100%' } as React.CSSProperties}
          onInput={e => setForm(f => ({ ...f, credential_alias: (e.target as unknown as HTMLInputElement).value }))}
        />
        <div style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
          Via (pre-receiver hops, if different from interface)
        </div>
        <ViaEditor
          value={form.via}
          onChange={via => setForm(f => ({ ...f, via }))}
          platforms={platforms}
          systems={systems}
        />
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button design="Emphasized" onClick={async () => {
            await onUpdate({ ...form, system_id: form.system_id || null })
            setEditing(false)
          }}>Save</Button>
        </div>
      </div>
    )
  }

  const sysName = systems.find(s => s.id === rec.system_id)?.name ?? '— no system —'
  return (
    <div style={{
      padding: '6px 0', borderBottom: '1px solid var(--sapList_BorderColor)',
      fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ flex: 1 }}>{sysName}</span>
        {rec.transport && (
          <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.72rem' }}>{rec.transport}</span>
        )}
        <Button design="Transparent" onClick={() => setEditing(true)}>Edit</Button>
        <Button design="Transparent" icon="decline" onClick={onDelete} />
      </div>
      {rec.via?.length > 0 && (
        <div style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginTop: '2px' }}>
          via: <ViaPath via={rec.via} />
        </div>
      )}
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ iface, api, onClose }: {
  iface:   Interface
  api:     ReturnType<typeof useRegistryApi>
  onClose: () => void
}) {
  const [tab,     setTab]     = useState<'info' | 'receivers'>('info')
  const [editing, setEditing] = useState(false)
  const [addRecv, setAddRecv] = useState(false)
  const [newRecv, setNewRecv] = useState({ system_id: '', transport: '', auth_type: '', credential_alias: '', via: [] as ViaHop[] })

  const senderName = api.systems.find(s => s.id === iface.sender_system_id)?.name ?? '—'
  const groupName  = api.logicalGroups.find(g => g.id === iface.logical_group_id)?.name

  if (editing) {
    return (
      <Panel title={iface.name} onClose={() => { setEditing(false); onClose() }}>
        <InterfaceForm
          initial={fromInterface(iface)}
          api={api}
          onSave={async body => { await api.updateInterface(iface.id, body); setEditing(false) }}
          onCancel={() => setEditing(false)}
          onDelete={async () => { await api.deleteInterface(iface.id); onClose() }}
        />
      </Panel>
    )
  }

  const systems = api.systems

  return (
    <Panel
      title={iface.name}
      onClose={onClose}
      action={<Button onClick={() => setEditing(true)}>Edit</Button>}
    >
      {/* Tab strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--sapList_BorderColor)', marginBottom: '12px' }}>
        {(['info', 'receivers'] as const).map(t => (
          <Button
            key={t}
            design="Transparent"
            onClick={() => setTab(t)}
            style={{
              borderRadius: 0,
              borderBottom: tab === t ? '2px solid var(--sapHighlightColor)' : '2px solid transparent',
              marginBottom: '-1px',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--sapHighlightColor)' : undefined,
            } as React.CSSProperties}
          >
            {t === 'info' ? 'Info' : `Receivers (${iface.receivers.length})`}
          </Button>
        ))}
      </div>

      {tab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <InfoRow label="Ref"><code style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{iface.ref}</code></InfoRow>
          {iface.build_ref && <InfoRow label="Build Ref">{iface.build_ref}</InfoRow>}
          <InfoRow label="Status">
            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', background: STATUS_COLORS[iface.status] ?? '#888', color: '#fff', fontFamily: 'var(--sapFontFamily)' }}>
              {iface.status}
            </span>
          </InfoRow>
          <InfoRow label="Type">{TYPE_LABELS[iface.interface_type] ?? iface.interface_type}</InfoRow>
          <InfoRow label="Sender">{senderName}</InfoRow>
          {groupName && <InfoRow label="Group">{groupName}</InfoRow>}
          {iface.sequence_in_group != null && <InfoRow label="Sequence">{iface.sequence_in_group}</InfoRow>}
          {iface.sender_step_label   && <InfoRow label="Sender step">{iface.sender_step_label}</InfoRow>}
          {iface.receiver_step_label && <InfoRow label="Recv. step">{iface.receiver_step_label}</InfoRow>}
          {iface.functional_domain   && <InfoRow label="Domain">{iface.functional_domain}</InfoRow>}
          {iface.via?.length > 0     && <InfoRow label="Via"><ViaPath via={iface.via} /></InfoRow>}
          {iface.description && (
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600, marginBottom: '4px' }}>Description</div>
              <p style={{ margin: 0, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', whiteSpace: 'pre-wrap' }}>{iface.description}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'receivers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {iface.receivers.map(rec => (
            <ReceiverRow
              key={rec.id}
              rec={rec}
              systems={systems}
              platforms={api.config.platforms}
              onUpdate={body => api.updateReceiver(iface.id, rec.id, body)}
              onDelete={() => api.deleteReceiver(iface.id, rec.id)}
            />
          ))}
          {iface.receivers.length === 0 && !addRecv && (
            <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', padding: '8px 0' }}>
              No receivers yet.
            </div>
          )}

          {addRecv ? (
            <div style={{
              padding: '8px', border: '1px solid var(--sapList_BorderColor)',
              borderRadius: '4px', marginTop: '6px',
              display: 'flex', flexDirection: 'column', gap: '6px',
            }}>
              <Select
                style={{ width: '100%' } as React.CSSProperties}
                onChange={e => setNewRecv(r => ({ ...r, system_id: selVal(e) }))}
              >
                <Option value="" selected={!newRecv.system_id}>— select system —</Option>
                {systems.map(s => (
                  <Option key={s.id} value={s.id} selected={newRecv.system_id === s.id}>{s.name}</Option>
                ))}
              </Select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <Select
                  style={{ width: '100%' } as React.CSSProperties}
                  onChange={e => setNewRecv(r => ({ ...r, transport: selVal(e) }))}
                >
                  {TRANSPORTS.map(t => (
                    <Option key={t} value={t} selected={newRecv.transport === t}>{t || '—'}</Option>
                  ))}
                </Select>
                <Select
                  style={{ width: '100%' } as React.CSSProperties}
                  onChange={e => setNewRecv(r => ({ ...r, auth_type: selVal(e) }))}
                >
                  {AUTH_TYPES.map(a => (
                    <Option key={a} value={a} selected={newRecv.auth_type === a}>{a || '—'}</Option>
                  ))}
                </Select>
              </div>
              <Input
                value={newRecv.credential_alias}
                placeholder="Credential alias"
                style={{ width: '100%' } as React.CSSProperties}
                onInput={e => setNewRecv(r => ({ ...r, credential_alias: (e.target as unknown as HTMLInputElement).value }))}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>Via (pre-receiver hops)</div>
              <ViaEditor
                value={newRecv.via}
                onChange={via => setNewRecv(r => ({ ...r, via }))}
                platforms={api.config.platforms}
                systems={api.systems}
              />
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <Button onClick={() => {
                  setAddRecv(false)
                  setNewRecv({ system_id: '', transport: '', auth_type: '', credential_alias: '', via: [] })
                }}>Cancel</Button>
                <Button design="Emphasized" onClick={async () => {
                  await api.addReceiver(iface.id, { ...newRecv, system_id: newRecv.system_id || null })
                  setAddRecv(false)
                  setNewRecv({ system_id: '', transport: '', auth_type: '', credential_alias: '', via: [] })
                }}>Add</Button>
              </div>
            </div>
          ) : (
            <Button
              style={{ marginTop: '6px', textAlign: 'left' } as React.CSSProperties}
              onClick={() => setAddRecv(true)}
            >
              + Add Receiver
            </Button>
          )}
        </div>
      )}
    </Panel>
  )
}

// ── Multi-select dropdown filter pill ────────────────────────────────────────
// The trigger uses a native <button> to achieve the pill shape; converting to
// UI5 Button would require overriding its border-radius and internal padding
// in ways that are not guaranteed stable across UI5 versions. The Clear button
// inside the open dropdown uses UI5 Button.

function MultiDropdown({
  label, options, selected, onChange,
}: {
  label:    string
  options:  { value: string; label: string; color?: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  }

  const active = selected.length > 0

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
          border: `1px solid ${active ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'}`,
          borderRadius: '14px',
          background: active ? 'var(--sapHighlightColor)' : 'var(--sapTile_Background)',
          color: active ? '#fff' : 'var(--sapTextColor)',
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        {label}{active ? ` (${selected.length})` : ''} <span style={{ fontSize: '0.6rem' }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300,
          background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          minWidth: '150px', overflow: 'hidden',
        }}>
          {selected.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--sapList_BorderColor)' }}>
              <Button
                design="Transparent"
                onClick={() => onChange([])}
                style={{ width: '100%', fontSize: '0.72rem', color: 'var(--sapHighlightColor)' } as React.CSSProperties}
              >
                Clear
              </Button>
            </div>
          )}
          {options.map(opt => (
            <label key={opt.value} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 10px', cursor: 'pointer',
              borderBottom: '1px solid var(--sapList_BorderColor)',
              background: selected.includes(opt.value) ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
            }}>
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} style={{ margin: 0 }} />
              {opt.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />}
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem', color: 'var(--sapTextColor)' }}>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Interface row ─────────────────────────────────────────────────────────────

function InterfaceRow({ iface, systems, selected, onClick }: {
  iface:    Interface
  systems:  System[]
  selected: boolean
  onClick:  () => void
}) {
  const senderName = systems.find(s => s.id === iface.sender_system_id)?.name ?? '—'
  const receivers  = iface.receivers.map(r => systems.find(s => s.id === r.system_id)?.name).filter(Boolean).join(', ') || '—'
  return (
    <div
      onClick={onClick}
      data-iface-id={iface.id}
      style={{
        display: 'grid', gridTemplateColumns: '100px 1fr 140px 140px 80px 90px',
        gap: '0 12px', padding: '8px 12px', cursor: 'pointer',
        borderBottom: '1px solid var(--sapList_BorderColor)',
        background: selected ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
        alignItems: 'center',
      }}
    >
      <code style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>{iface.ref}</code>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iface.name}</div>
        {iface.build_ref && <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>{iface.build_ref}</div>}
      </div>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{senderName}</span>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receivers}</span>
      <span><span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', background: STATUS_COLORS[iface.status] ?? '#888', color: '#fff', fontFamily: 'var(--sapFontFamily)' }}>{iface.status}</span></span>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>{TYPE_LABELS[iface.interface_type] ?? iface.interface_type}</span>
    </div>
  )
}

// ── Registry Grid ─────────────────────────────────────────────────────────────

export default function RegistryGrid({ initialSenderSystemId, initialReceiverSystemId, initialIfaceId, onBack }: Props) {
  const api = useRegistryApi()
  const [selectedId, setSelectedId] = useState<string | null>(initialIfaceId ?? null)
  const [creating,   setCreating]   = useState(false)
  const [search,     setSearch]     = useState('')
  const [statuses,   setStatuses]   = useState<string[]>([])
  const [types,      setTypes]      = useState<string[]>([])
  const [pairFilter, setPairFilter] = useState<{ sender: string; receiver: string } | null>(
    initialSenderSystemId && initialReceiverSystemId
      ? { sender: initialSenderSystemId, receiver: initialReceiverSystemId }
      : null
  )

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!initialIfaceId) return
    const el = document.querySelector(`[data-iface-id="${initialIfaceId}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [initialIfaceId, api.interfaces]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = api.interfaces
    if (pairFilter) {
      const { sender: a, receiver: b } = pairFilter
      list = list.filter(i =>
        (i.sender_system_id === a && i.receivers.some(r => r.system_id === b)) ||
        (i.sender_system_id === b && i.receivers.some(r => r.system_id === a))
      )
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) || i.ref.toLowerCase().includes(q) ||
        i.build_ref.toLowerCase().includes(q) || i.functional_domain.toLowerCase().includes(q)
      )
    }
    if (statuses.length) list = list.filter(i => statuses.includes(i.status))
    if (types.length)    list = list.filter(i => types.includes(i.interface_type))
    return list
  }, [api.interfaces, search, statuses, types, pairFilter])

  const selected     = selectedId ? api.interfaces.find(i => i.id === selectedId) ?? null : null
  const senderName   = pairFilter ? api.systems.find(s => s.id === pairFilter.sender)?.name   : undefined
  const receiverName = pairFilter ? api.systems.find(s => s.id === pairFilter.receiver)?.name : undefined

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)',
          background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
        }}>
          {onBack && (
            <Button icon="nav-back" onClick={onBack}>Back</Button>
          )}
          <Input
            placeholder="Search name, ref, build ref…"
            value={search}
            showClearIcon
            style={{ width: '220px' } as React.CSSProperties}
            onInput={e => setSearch((e.target as unknown as HTMLInputElement).value)}
          />
          <MultiDropdown
            label="Status"
            options={STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1), color: STATUS_COLORS[s] }))}
            selected={statuses}
            onChange={setStatuses}
          />
          <MultiDropdown
            label="Type"
            options={INTERFACE_TYPES.map(t => ({ value: t, label: TYPE_LABELS[t] }))}
            selected={types}
            onChange={setTypes}
          />
          {pairFilter && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '3px 10px', borderRadius: '12px',
              background: 'var(--sapInformativeBackground)',
              border: '1px solid var(--sapInformativeColor)',
              fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapTextColor)',
            }}>
              {senderName} → {receiverName}
              <Button design="Transparent" icon="decline" onClick={() => setPairFilter(null)} style={{ padding: 0, minWidth: 0 } as React.CSSProperties} />
            </div>
          )}
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
            {filtered.length} of {api.interfaces.length}
          </span>
          <Button design="Emphasized" icon="add" onClick={() => { setSelectedId(null); setCreating(true) }}>
            New Interface
          </Button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 140px 140px 80px 90px', gap: '0 12px', padding: '6px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
          {['Ref', 'Name / Build Ref', 'Sender', 'Receivers', 'Status', 'Type'].map(h => (
            <span key={h} style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {api.loading && (
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
              Loading…
            </div>
          )}
          {!api.loading && filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
              {api.interfaces.length === 0 ? 'No interfaces yet — click New Interface to add one.' : 'No interfaces match the current filters.'}
            </div>
          )}
          {filtered.map(iface => (
            <InterfaceRow
              key={iface.id}
              iface={iface}
              systems={api.systems}
              selected={selectedId === iface.id}
              onClick={() => { setCreating(false); setSelectedId(p => p === iface.id ? null : iface.id) }}
            />
          ))}
        </div>
      </div>

      {/* Create panel */}
      {creating && (
        <Panel title="New Interface" onClose={() => setCreating(false)}>
          <InterfaceForm
            initial={emptyIfaceForm()}
            api={api}
            onSave={async body => { await api.createInterface(body); setCreating(false) }}
            onCancel={() => setCreating(false)}
          />
        </Panel>
      )}

      {/* Detail / edit panel */}
      {selected && !creating && (
        <DetailPanel iface={selected} api={api} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

// ── Shared panel + helpers ────────────────────────────────────────────────────

function Panel({ title, children, onClose, action }: {
  title:    string
  children: React.ReactNode
  onClose:  () => void
  action?:  React.ReactNode
}) {
  return (
    <div style={{
      width: '380px', flexShrink: 0,
      borderLeft: '1px solid var(--sapList_BorderColor)',
      background: 'var(--sapGroup_ContentBackground)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold',
          color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', flex: 1, marginRight: '8px',
        }}>
          {title}
        </span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
          {action}
          <Button design="Transparent" icon="decline" onClick={onClose} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>{children}</div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>
      <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: '90px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--sapTextColor)' }}>{children}</span>
    </div>
  )
}
