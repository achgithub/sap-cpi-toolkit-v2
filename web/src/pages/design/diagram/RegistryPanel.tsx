import { useState } from 'react'
import { Button, Input, Select, Option, Dialog, Bar, MessageStrip, FlexBox, FlexBoxJustifyContent } from '@ui5/webcomponents-react'
import type { IFSystem, IFInterface, RegistryConfig } from './types'
import { STATUS_COLORS, TYPE_LABELS, STATUSES, INTERFACE_TYPES, getSystemColor } from './types'

interface Props {
  systems: IFSystem[]
  interfaces: IFInterface[]
  config: RegistryConfig
  selectedId: string | null
  onSelect: (id: string) => void
  onCreateSystem: (body: Partial<IFSystem>) => Promise<void>
  onUpdateSystem: (id: string, body: Partial<IFSystem>) => Promise<void>
  onCreateInterface: (body: Partial<IFInterface>) => Promise<void>
  onDeleteSystem: (id: string) => Promise<void>
}

type SystemForm = { name: string; description: string; system_type: string; infra_type: string; infra_region: string }
type IfaceForm  = {
  name: string; description: string
  interface_type: IFInterface['interface_type']; status: IFInterface['status']
  sender_system_id: string | null; integration_platform: string
}

const emptySystem = (): SystemForm => ({ name: '', description: '', system_type: '', infra_type: '', infra_region: '' })
const emptyIface  = (): IfaceForm  => ({
  name: '', description: '', interface_type: 'point_to_point', status: 'design',
  sender_system_id: null, integration_platform: '',
})

export default function RegistryPanel({ systems, interfaces, config, selectedId, onSelect, onCreateSystem, onUpdateSystem, onCreateInterface, onDeleteSystem }: Props) {
  const [tab,        setTab]        = useState<'interfaces' | 'systems'>('interfaces')
  const [systemDlg,  setSystemDlg]  = useState(false)
  const [editSystem, setEditSystem] = useState<IFSystem | null>(null)
  const [ifaceDlg,   setIfaceDlg]   = useState(false)
  const [systemForm, setSystemForm] = useState(emptySystem())
  const [ifaceForm,  setIfaceForm]  = useState(emptyIface())
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [filter,     setFilter]     = useState('')
  const [deleteId,   setDeleteId]   = useState<string | null>(null)

  async function saveSystem() {
    if (!systemForm.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      if (editSystem) {
        await onUpdateSystem(editSystem.id, systemForm)
        setEditSystem(null)
      } else {
        await onCreateSystem(systemForm)
        setSystemDlg(false)
      }
      setSystemForm(emptySystem())
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  function openEditSystem(s: IFSystem) {
    setEditSystem(s)
    setSystemForm({ name: s.name, description: s.description, system_type: s.system_type, infra_type: s.infra_type, infra_region: s.infra_region })
    setError('')
  }

  async function saveIface() {
    if (!ifaceForm.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try { await onCreateInterface({ ...ifaceForm }); setIfaceDlg(false); setIfaceForm(emptyIface()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const filtered = filter
    ? interfaces.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()))
    : interfaces

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0 }}>
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

      {/* Interfaces tab */}
      {tab === 'interfaces' && (
        <>
          <div style={{ display: 'flex', gap: '6px', padding: '8px', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
            <Input placeholder="Filter…" value={filter} onInput={e => setFilter((e.target as unknown as HTMLInputElement).value)} style={{ flex: 1 }} />
            <Button design="Emphasized" icon="add" onClick={() => { setError(''); setIfaceDlg(true) }}>New</Button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>No interfaces yet.</div>
              : filtered.map(iface => (
                <div key={iface.id} onClick={() => onSelect(iface.id)} style={{
                  padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)',
                  background: selectedId === iface.id ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '3px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: STATUS_COLORS[iface.status] ?? '#888' }} />
                    <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {iface.name}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>{TYPE_LABELS[iface.interface_type]}</span>
                  </div>
                  {(iface.integration_platform || iface.receivers.length > 0) && (
                    <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', paddingLeft: '13px', display: 'flex', gap: '8px' }}>
                      {iface.integration_platform && <span>{iface.integration_platform}</span>}
                      {iface.receivers.length > 0 && <span>{iface.receivers.length} receiver{iface.receivers.length !== 1 ? 's' : ''}</span>}
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        </>
      )}

      {/* Systems tab */}
      {tab === 'systems' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
            <Button design="Emphasized" icon="add" onClick={() => { setError(''); setSystemDlg(true) }}>New System</Button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {systems.length === 0
              ? <div style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>No systems yet.</div>
              : systems.map(s => {
                const color = getSystemColor(s.system_type, config)
                const infra = [s.infra_type, s.infra_region].filter(Boolean).join(' · ')
                return (
                  <div key={s.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', fontWeight: 'bold' }}>{s.name}</div>
                      {(s.system_type || infra) && (
                        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
                          {[s.system_type, infra].filter(Boolean).join(' — ')}
                        </div>
                      )}
                    </div>
                    <Button design="Transparent" icon="edit" onClick={() => openEditSystem(s)} />
                    <Button design="Transparent" icon="delete" onClick={() => setDeleteId(s.id)} />
                  </div>
                )
              })
            }
          </div>
        </>
      )}

      {/* Edit System dialog */}
      <Dialog open={!!editSystem} headerText="Edit System" onClose={() => setEditSystem(null)} style={{ width: '440px', maxWidth: '95vw' }}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <F label="Name"><Input value={systemForm.name} onInput={e => setSystemForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} /></F>
          <F label="Description"><Input value={systemForm.description} onInput={e => setSystemForm(f => ({ ...f, description: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} /></F>
          <F label="System Type">
            <Select value={systemForm.system_type} onChange={e => setSystemForm(f => ({ ...f, system_type: (e.target as unknown as HTMLSelectElement).value }))}>
              <Option value="">— select type —</Option>
              {config.systemTypes.map(t => <Option key={t.name} value={t.name}>{t.name}</Option>)}
            </Select>
          </F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <F label="Infrastructure">
              <Select value={systemForm.infra_type} onChange={e => setSystemForm(f => ({ ...f, infra_type: (e.target as unknown as HTMLSelectElement).value }))}>
                <Option value="">— unknown —</Option>
                {config.infraTypes.map(t => <Option key={t.name} value={t.name}>{t.name}</Option>)}
              </Select>
            </F>
            <F label="Region / Location">
              <Input value={systemForm.infra_region} placeholder="e.g. eu-west-1, London" onInput={e => setSystemForm(f => ({ ...f, infra_region: (e.target as unknown as HTMLInputElement).value }))} />
            </F>
          </div>
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setEditSystem(null)}>Cancel</Button>
            <Button design="Emphasized" onClick={saveSystem} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </FlexBox>
        </Bar>
      </Dialog>

      {/* New System dialog */}
      <Dialog open={systemDlg} headerText="New System" onClose={() => setSystemDlg(false)} style={{ width: '440px', maxWidth: '95vw' }}>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <F label="Name"><Input value={systemForm.name} onInput={e => setSystemForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} /></F>
          <F label="Description"><Input value={systemForm.description} onInput={e => setSystemForm(f => ({ ...f, description: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} /></F>
          <F label="System Type">
            <Select value={systemForm.system_type} onChange={e => setSystemForm(f => ({ ...f, system_type: (e.target as unknown as HTMLSelectElement).value }))}>
              <Option value="">— select type —</Option>
              {config.systemTypes.map(t => <Option key={t.name} value={t.name}>{t.name}</Option>)}
            </Select>
          </F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <F label="Infrastructure">
              <Select value={systemForm.infra_type} onChange={e => setSystemForm(f => ({ ...f, infra_type: (e.target as unknown as HTMLSelectElement).value }))}>
                <Option value="">— unknown —</Option>
                {config.infraTypes.map(t => <Option key={t.name} value={t.name}>{t.name}</Option>)}
              </Select>
            </F>
            <F label="Region / Location">
              <Input value={systemForm.infra_region} placeholder="e.g. eu-west-1, London" onInput={e => setSystemForm(f => ({ ...f, infra_region: (e.target as unknown as HTMLInputElement).value }))} />
            </F>
          </div>
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
          <F label="Name"><Input value={ifaceForm.name} onInput={e => setIfaceForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} /></F>
          <F label="Description"><Input value={ifaceForm.description} onInput={e => setIfaceForm(f => ({ ...f, description: (e.target as unknown as HTMLInputElement).value }))} style={{ width: '100%' }} /></F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <F label="Type">
              <Select value={ifaceForm.interface_type} onChange={e => setIfaceForm(f => ({ ...f, interface_type: (e.target as unknown as HTMLSelectElement).value as IFInterface['interface_type'] }))}>
                {INTERFACE_TYPES.map(t => <Option key={t} value={t}>{TYPE_LABELS[t]}</Option>)}
              </Select>
            </F>
            <F label="Status">
              <Select value={ifaceForm.status} onChange={e => setIfaceForm(f => ({ ...f, status: (e.target as unknown as HTMLSelectElement).value as IFInterface['status'] }))}>
                {STATUSES.map(s => <Option key={s} value={s}>{s}</Option>)}
              </Select>
            </F>
            <F label="Sender System">
              <Select value={ifaceForm.sender_system_id ?? ''} onChange={e => setIfaceForm(f => ({ ...f, sender_system_id: (e.target as unknown as HTMLSelectElement).value || null }))}>
                <Option value="">— none —</Option>
                {systems.map(s => <Option key={s.id} value={s.id}>{s.name}</Option>)}
              </Select>
            </F>
            <F label="Integration Platform">
              <Select value={ifaceForm.integration_platform} onChange={e => setIfaceForm(f => ({ ...f, integration_platform: (e.target as unknown as HTMLSelectElement).value }))}>
                <Option value="">— unknown —</Option>
                {config.platforms.map(p => <Option key={p.name} value={p.name}>{p.name}</Option>)}
              </Select>
            </F>
          </div>
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setIfaceDlg(false)}>Cancel</Button>
            <Button design="Emphasized" onClick={saveIface} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </FlexBox>
        </Bar>
      </Dialog>

      {/* Delete system confirm */}
      <Dialog open={!!deleteId} headerText="Delete System" onClose={() => setDeleteId(null)} style={{ width: '380px', maxWidth: '95vw' }}>
        <div style={{ padding: '1rem', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapTextColor)' }}>
          Remove this system? Interfaces referencing it will lose the sender/receiver link but will not be deleted.
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button design="Negative" onClick={async () => { if (deleteId) { await onDeleteSystem(deleteId); setDeleteId(null) } }}>Delete</Button>
          </FlexBox>
        </Bar>
      </Dialog>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>{label}</span>
      {children}
    </div>
  )
}
