import { useState } from 'react'
import { Button, Input, Label, Select, Option, MessageStrip } from '@ui5/webcomponents-react'
import type { IFInterface, IFSystem, IFReceiver, RegistryConfig } from './types'
import { INTERFACE_TYPES, STATUSES, TRANSPORTS, AUTH_TYPES, STATUS_COLORS, TYPE_LABELS } from './types'

interface Props {
  iface: IFInterface
  systems: IFSystem[]
  config: RegistryConfig
  onUpdate: (body: Partial<IFInterface>) => Promise<void>
  onDelete: () => Promise<void>
  onAddReceiver: (body: object) => Promise<void>
  onUpdateReceiver: (rid: string, body: object) => Promise<void>
  onDeleteReceiver: (rid: string) => Promise<void>
  onClose: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <Label style={{ fontSize: '0.75rem' }}>{label}</Label>
      {children}
    </div>
  )
}

function MetaEditor({ meta, onChange }: { meta: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {Object.entries(meta).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <Input value={k} readonly style={{ flex: '0 0 110px', fontSize: '0.75rem' }} />
          <Input value={v} onInput={e => onChange({ ...meta, [k]: (e.target as unknown as HTMLInputElement).value })}
            style={{ flex: 1, fontSize: '0.75rem' }} />
          <Button design="Transparent" icon="delete" onClick={() => { const m = { ...meta }; delete m[k]; onChange(m) }} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
        <Input placeholder="key" value={newKey} onInput={e => setNewKey((e.target as unknown as HTMLInputElement).value)}
          style={{ flex: '0 0 110px', fontSize: '0.75rem' }} />
        <Input placeholder="value" value={newVal} onInput={e => setNewVal((e.target as unknown as HTMLInputElement).value)}
          style={{ flex: 1, fontSize: '0.75rem' }} />
        <Button design="Transparent" icon="add" onClick={() => {
          if (!newKey.trim()) return
          onChange({ ...meta, [newKey.trim()]: newVal })
          setNewKey(''); setNewVal('')
        }} />
      </div>
    </div>
  )
}

function ReceiverRow({ rec, systems, onUpdate, onDelete }: {
  rec: IFReceiver; systems: IFSystem[]
  onUpdate: (body: object) => Promise<void>; onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...rec })
  const [saving, setSaving] = useState(false)
  const systemName = systems.find(s => s.id === rec.system_id)?.name ?? '—'

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderBottom: '1px solid var(--sapList_BorderColor)', fontSize: '0.8rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapTextColor)' }}>
        <span style={{ flex: 1 }}>{systemName}</span>
        {rec.transport && <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.72rem' }}>{rec.transport}</span>}
        {rec.auth_type  && <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.72rem' }}>{rec.auth_type}</span>}
        <Button design="Transparent" icon="edit" onClick={() => setEditing(true)} />
        <Button design="Transparent" icon="delete" onClick={onDelete} />
      </div>
    )
  }

  async function save() {
    setSaving(true)
    try { await onUpdate(form); setEditing(false) } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: '8px', borderBottom: '1px solid var(--sapList_BorderColor)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Field label="System">
        <Select value={form.system_id ?? ''} onChange={e => setForm(f => ({ ...f, system_id: (e.target as unknown as HTMLSelectElement).value || null }))}>
          <Option value="">— none —</Option>
          {systems.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
        </Select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <Field label="CPI iFlow">
          <Input value={form.cpi_iflow_id} onInput={e => setForm(f => ({ ...f, cpi_iflow_id: (e.target as unknown as HTMLInputElement).value }))} />
        </Field>
        <Field label="Transport">
          <Select value={form.transport} onChange={e => setForm(f => ({ ...f, transport: (e.target as unknown as HTMLSelectElement).value }))}>
            {TRANSPORTS.map(t => <Option key={t} value={t}>{t || '—'}</Option>)}
          </Select>
        </Field>
        <Field label="Auth">
          <Select value={form.auth_type} onChange={e => setForm(f => ({ ...f, auth_type: (e.target as unknown as HTMLSelectElement).value }))}>
            {AUTH_TYPES.map(a => <Option key={a} value={a}>{a || '—'}</Option>)}
          </Select>
        </Field>
        <Field label="Credential Alias">
          <Input value={form.credential_alias} onInput={e => setForm(f => ({ ...f, credential_alias: (e.target as unknown as HTMLInputElement).value }))} />
        </Field>
      </div>
      <MetaEditor meta={form.meta ?? {}} onChange={m => setForm(f => ({ ...f, meta: m }))} />
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <Button onClick={() => setEditing(false)}>Cancel</Button>
        <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}

export default function InterfaceDetail({ iface, systems, config, onUpdate, onDelete, onAddReceiver, onUpdateReceiver, onDeleteReceiver, onClose }: Props) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<IFInterface>>({ ...iface })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    try { await onUpdate({ ...form, receivers: iface.receivers }); setEditing(false) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const senderName = systems.find(s => s.id === iface.sender_system_id)?.name ?? '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0 }}>
        <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '0.68rem', background: STATUS_COLORS[iface.status] ?? '#888', color: '#fff', fontFamily: 'var(--sapFontFamily)' }}>{iface.status}</span>
        <span style={{ padding: '1px 6px', borderRadius: '10px', fontSize: '0.68rem', background: 'var(--sapHighlightColor)', color: '#fff', fontFamily: 'var(--sapFontFamily)' }}>{TYPE_LABELS[iface.interface_type]}</span>
        <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iface.name}</span>
        {!editing && <Button design="Transparent" icon="edit" onClick={() => { setForm({ ...iface }); setEditing(true) }} />}
        <Button design="Transparent" icon="decline" onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'end' }}>
              <Field label="Name">
                <Input value={form.name ?? ''} onInput={e => setForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
              </Field>
              <Field label="Ref (10 chars) *">
                <Input
                  value={form.interface_ref ?? ''}
                  onInput={e => {
                    const v = (e.target as unknown as HTMLInputElement).value.slice(0, 10).toUpperCase()
                    setForm(f => ({ ...f, interface_ref: v }))
                  }}
                  style={{ width: '100px', fontFamily: 'monospace' }}
                />
              </Field>
            </div>
            <Field label="Description">
              <Input value={form.description ?? ''} onInput={e => setForm(f => ({ ...f, description: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <Field label="Type">
                <Select value={form.interface_type} onChange={e => setForm(f => ({ ...f, interface_type: (e.target as unknown as HTMLSelectElement).value as IFInterface['interface_type'] }))}>
                  {INTERFACE_TYPES.map(t => <Option key={t} value={t}>{TYPE_LABELS[t]}</Option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: (e.target as unknown as HTMLSelectElement).value as IFInterface['status'] }))}>
                  {STATUSES.map(s => <Option key={s} value={s}>{s}</Option>)}
                </Select>
              </Field>
              <Field label="Sender System">
                <Select value={form.sender_system_id ?? ''} onChange={e => setForm(f => ({ ...f, sender_system_id: (e.target as unknown as HTMLSelectElement).value || null }))}>
                  <Option value="">— none —</Option>
                  {systems.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
                </Select>
              </Field>
              <Field label="Integration Platform">
                <Select value={form.integration_platform ?? ''} onChange={e => setForm(f => ({ ...f, integration_platform: (e.target as unknown as HTMLSelectElement).value }))}>
                  <Option value="">— unknown —</Option>
                  {config.platforms.map(p => <Option key={p.name} value={p.name}>{p.name}</Option>)}
                </Select>
              </Field>
              <Field label="CPI Package">
                <Input value={form.cpi_package_id ?? ''} onInput={e => setForm(f => ({ ...f, cpi_package_id: (e.target as unknown as HTMLInputElement).value }))} />
              </Field>
              <Field label="CPI iFlow">
                <Input value={form.cpi_iflow_id ?? ''} onInput={e => setForm(f => ({ ...f, cpi_iflow_id: (e.target as unknown as HTMLInputElement).value }))} />
              </Field>
            </div>

            {/* P2P connection config */}
            {form.interface_type !== 'broadcast' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Field label="Transport">
                  <Select value={form.transport} onChange={e => setForm(f => ({ ...f, transport: (e.target as unknown as HTMLSelectElement).value }))}>
                    {TRANSPORTS.map(t => <Option key={t} value={t}>{t || '—'}</Option>)}
                  </Select>
                </Field>
                <Field label="Auth">
                  <Select value={form.auth_type} onChange={e => setForm(f => ({ ...f, auth_type: (e.target as unknown as HTMLSelectElement).value }))}>
                    {AUTH_TYPES.map(a => <Option key={a} value={a}>{a || '—'}</Option>)}
                  </Select>
                </Field>
                <Field label="Credential Alias">
                  <Input value={form.credential_alias ?? ''} onInput={e => setForm(f => ({ ...f, credential_alias: (e.target as unknown as HTMLInputElement).value }))} />
                </Field>
              </div>
            )}

            <div>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '4px' }}>Additional Fields</div>
              <MetaEditor meta={form.meta ?? {}} onChange={m => setForm(f => ({ ...f, meta: m }))} />
            </div>

            <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
              <Button design="Negative" onClick={onDelete}>Delete</Button>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Button onClick={() => setEditing(false)}>Cancel</Button>
                <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>
            {iface.interface_ref && <InfoRow label="Ref"><code style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{iface.interface_ref}</code></InfoRow>}
            {iface.description && <p style={{ margin: 0, color: 'var(--sapContent_LabelColor)' }}>{iface.description}</p>}
            <InfoRow label="Sender">{senderName}</InfoRow>
            {iface.integration_platform && <InfoRow label="Platform">{iface.integration_platform}</InfoRow>}
            {iface.cpi_package_id && <InfoRow label="Package">{iface.cpi_package_id}</InfoRow>}
            {iface.cpi_iflow_id   && <InfoRow label="iFlow">{iface.cpi_iflow_id}</InfoRow>}
            {iface.interface_type !== 'broadcast' && (
              <>
                {iface.transport        && <InfoRow label="Transport">{iface.transport}</InfoRow>}
                {iface.auth_type        && <InfoRow label="Auth">{iface.auth_type}</InfoRow>}
                {iface.credential_alias && <InfoRow label="Credential Alias">{iface.credential_alias}</InfoRow>}
              </>
            )}
            {Object.entries(iface.meta ?? {}).map(([k, v]) => (
              <InfoRow key={k} label={k}>{v}</InfoRow>
            ))}
          </div>
        )}

        {/* Receivers */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)', marginBottom: '4px' }}>
            <span>Receivers ({iface.receivers.length})</span>
            <Button design="Transparent" icon="add" onClick={() => onAddReceiver({ system_id: null, cpi_iflow_id: '', transport: '', auth_type: '', credential_alias: '', meta: {} })}>Add</Button>
          </div>
          <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', overflow: 'hidden' }}>
            {iface.receivers.length === 0
              ? <div style={{ padding: '12px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center' }}>No receivers</div>
              : iface.receivers.map(rec => (
                <ReceiverRow key={rec.id} rec={rec} systems={systems}
                  onUpdate={body => onUpdateReceiver(rec.id, body)}
                  onDelete={() => onDeleteReceiver(rec.id)}
                />
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: '110px', flexShrink: 0 }}>{label}</span>
      <span>{children}</span>
    </div>
  )
}
