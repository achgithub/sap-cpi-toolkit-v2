import { useState } from 'react'
import { Button, Input, Label, Select, Option, CheckBox, MessageStrip } from '@ui5/webcomponents-react'
import type { IFInterface, IFSystem, IFReceiver } from './types'
import { INTERFACE_TYPES, STATUSES, TRANSPORTS, AUTH_TYPES, STATUS_COLORS, TYPE_LABELS } from './types'

interface Props {
  iface: IFInterface
  systems: IFSystem[]
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
  const entries = Object.entries(meta)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <Input value={k} readonly style={{ flex: '0 0 120px', fontSize: '0.75rem' }} />
          <Input
            value={v}
            onInput={e => {
              const updated = { ...meta, [k]: (e.target as unknown as HTMLInputElement).value }
              onChange(updated)
            }}
            style={{ flex: 1, fontSize: '0.75rem' }}
          />
          <Button design="Transparent" icon="delete" onClick={() => {
            const updated = { ...meta }
            delete updated[k]
            onChange(updated)
          }} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
        <Input
          placeholder="key"
          value={newKey}
          onInput={e => setNewKey((e.target as unknown as HTMLInputElement).value)}
          style={{ flex: '0 0 120px', fontSize: '0.75rem' }}
        />
        <Input
          placeholder="value"
          value={newVal}
          onInput={e => setNewVal((e.target as unknown as HTMLInputElement).value)}
          style={{ flex: 1, fontSize: '0.75rem' }}
        />
        <Button design="Transparent" icon="add" onClick={() => {
          if (!newKey.trim()) return
          onChange({ ...meta, [newKey.trim()]: newVal })
          setNewKey('')
          setNewVal('')
        }} />
      </div>
    </div>
  )
}

function ReceiverRow({ rec, systems, onUpdate, onDelete }: {
  rec: IFReceiver
  systems: IFSystem[]
  onUpdate: (body: object) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...rec })
  const [saving, setSaving] = useState(false)

  const systemName = systems.find(s => s.id === rec.system_id)?.name ?? '—'

  if (!editing) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 8px', borderBottom: '1px solid var(--sapList_BorderColor)',
        fontSize: '0.8rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapTextColor)',
      }}>
        <span style={{ flex: 1 }}>{systemName}</span>
        {rec.transport && <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem' }}>{rec.transport}</span>}
        {rec.auth_type  && <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem' }}>{rec.auth_type}</span>}
        <Button design="Transparent" icon="edit"   onClick={() => setEditing(true)} />
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
        <Field label="Firewall Zone">
          <Input value={form.firewall_zone} onInput={e => setForm(f => ({ ...f, firewall_zone: (e.target as unknown as HTMLInputElement).value }))} />
        </Field>
        <Field label="Credential Alias" >
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

export default function InterfaceDetail({ iface, systems, onUpdate, onDelete, onAddReceiver, onUpdateReceiver, onDeleteReceiver, onClose }: Props) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<IFInterface>>({ ...iface })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      await onUpdate({ ...form, receivers: iface.receivers })
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function addBlankReceiver() {
    await onAddReceiver({ system_id: null, cpi_iflow_id: '', transport: '', auth_type: '', firewall_zone: '', credential_alias: '', meta: {} })
  }

  const senderName = systems.find(s => s.id === iface.sender_system_id)?.name ?? '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
        borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
      }}>
        <span style={{
          padding: '1px 6px', borderRadius: '10px', fontSize: '0.7rem',
          background: STATUS_COLORS[iface.status] ?? 'var(--sapNeutralColor)',
          color: '#fff', fontFamily: 'var(--sapFontFamily)',
        }}>{iface.status}</span>
        <span style={{
          padding: '1px 6px', borderRadius: '10px', fontSize: '0.7rem',
          background: 'var(--sapHighlightColor)', color: '#fff', fontFamily: 'var(--sapFontFamily)',
        }}>{TYPE_LABELS[iface.interface_type]}</span>
        <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {iface.name}
        </span>
        {!editing && <Button design="Transparent" icon="edit" onClick={() => { setForm({ ...iface }); setEditing(true) }} />}
        <Button design="Transparent" icon="decline" onClick={onClose} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

        {/* Core fields */}
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Field label="Name">
              <Input value={form.name ?? ''} onInput={e => setForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
            </Field>
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
                <Field label="Firewall Zone">
                  <Input value={form.firewall_zone ?? ''} onInput={e => setForm(f => ({ ...f, firewall_zone: (e.target as unknown as HTMLInputElement).value }))} />
                </Field>
                <Field label="Credential Alias">
                  <Input value={form.credential_alias ?? ''} onInput={e => setForm(f => ({ ...f, credential_alias: (e.target as unknown as HTMLInputElement).value }))} />
                </Field>
              </div>
            )}

            {/* Debug trigger */}
            <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <CheckBox
                checked={form.debug_trigger_enabled}
                onChange={e => setForm(f => ({ ...f, debug_trigger_enabled: (e.target as unknown as HTMLInputElement).checked }))}
                text="Debug Trigger"
              />
              {form.debug_trigger_enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px' }}>
                  <Field label="Method">
                    <Select value={form.debug_trigger_method} onChange={e => setForm(f => ({ ...f, debug_trigger_method: (e.target as unknown as HTMLSelectElement).value }))}>
                      <Option value="POST">POST</Option>
                      <Option value="GET">GET</Option>
                    </Select>
                  </Field>
                  <Field label="Path">
                    <Input value={form.debug_trigger_path ?? ''} onInput={e => setForm(f => ({ ...f, debug_trigger_path: (e.target as unknown as HTMLInputElement).value }))} placeholder="/debug/my-interface" />
                  </Field>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field label="Payload Template">
                      <Input value={form.debug_trigger_payload ?? ''} onInput={e => setForm(f => ({ ...f, debug_trigger_payload: (e.target as unknown as HTMLInputElement).value }))} placeholder='{"key": "value"}' />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* Unbound meta */}
            <div>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '4px' }}>Additional Fields</div>
              <MetaEditor meta={form.meta ?? {}} onChange={m => setForm(f => ({ ...f, meta: m }))} />
            </div>

            <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
              <Button design="Negative" onClick={onDelete}>Delete Interface</Button>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Button onClick={() => setEditing(false)}>Cancel</Button>
                <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>
            {iface.description && <p style={{ margin: 0, color: 'var(--sapContent_LabelColor)' }}>{iface.description}</p>}
            <InfoRow label="Sender">{senderName}</InfoRow>
            {iface.cpi_package_id && <InfoRow label="Package">{iface.cpi_package_id}</InfoRow>}
            {iface.cpi_iflow_id   && <InfoRow label="iFlow">{iface.cpi_iflow_id}</InfoRow>}
            {iface.interface_type !== 'broadcast' && (
              <>
                {iface.transport        && <InfoRow label="Transport">{iface.transport}</InfoRow>}
                {iface.auth_type        && <InfoRow label="Auth">{iface.auth_type}</InfoRow>}
                {iface.firewall_zone    && <InfoRow label="Firewall Zone">{iface.firewall_zone}</InfoRow>}
                {iface.credential_alias && <InfoRow label="Credential Alias">{iface.credential_alias}</InfoRow>}
              </>
            )}
            {iface.debug_trigger_enabled && (
              <InfoRow label="Debug Trigger">{iface.debug_trigger_method} {iface.debug_trigger_path}</InfoRow>
            )}
            {Object.entries(iface.meta ?? {}).map(([k, v]) => (
              <InfoRow key={k} label={k}>{v}</InfoRow>
            ))}
          </div>
        )}

        {/* Receivers */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold',
            color: 'var(--sapTextColor)', marginBottom: '4px',
          }}>
            <span>Receivers ({iface.receivers.length})</span>
            <Button design="Transparent" icon="add" onClick={addBlankReceiver}>Add</Button>
          </div>
          <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', overflow: 'hidden' }}>
            {iface.receivers.length === 0
              ? <div style={{ padding: '12px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center' }}>No receivers</div>
              : iface.receivers.map(rec => (
                <ReceiverRow
                  key={rec.id}
                  rec={rec}
                  systems={systems}
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
