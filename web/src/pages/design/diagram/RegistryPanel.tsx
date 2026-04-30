import { useState } from 'react'
import { Button, Input, Select, Option, Dialog, Bar, MessageStrip, FlexBox, FlexBoxJustifyContent } from '@ui5/webcomponents-react'
import type { IFSystem, IFInterface } from './types'
import { STATUS_COLORS, TYPE_LABELS, STATUSES, INTERFACE_TYPES, SYSTEM_TYPES } from './types'

interface Props {
  systems: IFSystem[]
  interfaces: IFInterface[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreateSystem: (body: Partial<IFSystem>) => Promise<void>
  onCreateInterface: (body: Partial<IFInterface>) => Promise<void>
}

type SystemForm = { name: string; description: string; system_type: string }
type IfaceForm  = {
  name: string; description: string
  interface_type: IFInterface['interface_type']; status: IFInterface['status']
  sender_system_id: string | null
  cpi_package_id: string; cpi_iflow_id: string; transport: string; auth_type: string
  firewall_zone: string; credential_alias: string; debug_trigger_enabled: boolean
  debug_trigger_method: string; debug_trigger_path: string; debug_trigger_payload: string
  meta: Record<string, string>
}
const emptySystem  = (): SystemForm => ({ name: '', description: '', system_type: 'external' })
const emptyIface   = (): IfaceForm  => ({
  name: '', description: '', interface_type: 'point_to_point', status: 'design',
  sender_system_id: null, cpi_package_id: '', cpi_iflow_id: '', transport: '', auth_type: '',
  firewall_zone: '', credential_alias: '', debug_trigger_enabled: false,
  debug_trigger_method: 'POST', debug_trigger_path: '', debug_trigger_payload: '',
  meta: {},
})

export default function RegistryPanel({ systems, interfaces, selectedId, onSelect, onCreateSystem, onCreateInterface }: Props) {
  const [tab,          setTab]          = useState<'interfaces' | 'systems'>('interfaces')
  const [systemDlg,    setSystemDlg]    = useState(false)
  const [ifaceDlg,     setIfaceDlg]     = useState(false)
  const [systemForm,   setSystemForm]   = useState(emptySystem())
  const [ifaceForm,    setIfaceForm]    = useState(emptyIface())
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [filter,       setFilter]       = useState('')

  async function saveSystem() {
    if (!systemForm.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      await onCreateSystem(systemForm)
      setSystemDlg(false)
      setSystemForm(emptySystem())
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function saveIface() {
    if (!ifaceForm.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      await onCreateInterface({ ...ifaceForm })
      setIfaceDlg(false)
      setIfaceForm(emptyIface())
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const filteredIfaces = filter
    ? interfaces.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()))
    : interfaces

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
      }}>
        {(['interfaces', 'systems'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
            borderBottom: tab === t ? '2px solid var(--sapHighlightColor)' : '2px solid transparent',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
            color: tab === t ? 'var(--sapHighlightColor)' : 'var(--sapTextColor)',
            textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'interfaces' && (
        <>
          <div style={{ display: 'flex', gap: '6px', padding: '8px', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
            <Input
              placeholder="Filter…"
              value={filter}
              onInput={e => setFilter((e.target as unknown as HTMLInputElement).value)}
              style={{ flex: 1 }}
            />
            <Button design="Emphasized" icon="add" onClick={() => { setError(''); setIfaceDlg(true) }}>New</Button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredIfaces.length === 0
              ? <div style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                  No interfaces yet — click New to add one.
                </div>
              : filteredIfaces.map(iface => (
                <div
                  key={iface.id}
                  onClick={() => onSelect(iface.id)}
                  style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)',
                    background: selectedId === iface.id ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '3px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                      background: STATUS_COLORS[iface.status] ?? 'var(--sapNeutralColor)',
                    }} />
                    <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {iface.name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>
                      {TYPE_LABELS[iface.interface_type]}
                    </span>
                  </div>
                  {iface.receivers.length > 0 && (
                    <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', paddingLeft: '13px' }}>
                      {iface.receivers.length} receiver{iface.receivers.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        </>
      )}

      {tab === 'systems' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
            <Button design="Emphasized" icon="add" onClick={() => { setError(''); setSystemDlg(true) }}>New System</Button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {systems.length === 0
              ? <div style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                  No systems yet — add systems to start building the diagram.
                </div>
              : systems.map(s => (
                <div key={s.id} style={{
                  padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)',
                  fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem' }}>{s.system_type}</span>
                </div>
              ))
            }
          </div>
        </>
      )}

      {/* New System dialog */}
      <Dialog open={systemDlg} headerText="New System" onClose={() => setSystemDlg(false)} style={{ width: '400px', maxWidth: '95vw' }}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <Field label="Name">
            <Input value={systemForm.name} onInput={e => setSystemForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </Field>
          <Field label="Description">
            <Input value={systemForm.description} onInput={e => setSystemForm(f => ({ ...f, description: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </Field>
          <Field label="Type">
            <Select value={systemForm.system_type} onChange={e => setSystemForm(f => ({ ...f, system_type: (e.target as unknown as HTMLSelectElement).value }))}>
              {SYSTEM_TYPES.map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          </Field>
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setSystemDlg(false)}>Cancel</Button>
            <Button design="Emphasized" onClick={saveSystem} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </FlexBox>
        </Bar>
      </Dialog>

      {/* New Interface dialog */}
      <Dialog open={ifaceDlg} headerText="New Interface" onClose={() => setIfaceDlg(false)} style={{ width: '480px', maxWidth: '95vw' }}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <Field label="Name">
            <Input value={ifaceForm.name} onInput={e => setIfaceForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </Field>
          <Field label="Description">
            <Input value={ifaceForm.description} onInput={e => setIfaceForm(f => ({ ...f, description: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Field label="Type">
              <Select value={ifaceForm.interface_type} onChange={e => setIfaceForm(f => ({ ...f, interface_type: (e.target as unknown as HTMLSelectElement).value as IFInterface['interface_type'] }))}>
                {INTERFACE_TYPES.map(t => <Option key={t} value={t}>{TYPE_LABELS[t]}</Option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={ifaceForm.status} onChange={e => setIfaceForm(f => ({ ...f, status: (e.target as unknown as HTMLSelectElement).value as IFInterface['status'] }))}>
                {STATUSES.map(s => <Option key={s} value={s}>{s}</Option>)}
              </Select>
            </Field>
            <Field label="Sender System">
              <Select value={ifaceForm.sender_system_id ?? ''} onChange={e => setIfaceForm(f => ({ ...f, sender_system_id: (e.target as unknown as HTMLSelectElement).value || null }))}>
                <Option value="">— none —</Option>
                {systems.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
              </Select>
            </Field>
          </div>
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setIfaceDlg(false)}>Cancel</Button>
            <Button design="Emphasized" onClick={saveIface} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </FlexBox>
        </Bar>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>{label}</span>
      {children}
    </div>
  )
}
