import { useState, useEffect, useCallback } from 'react'
import {
  Button, Dialog, Bar, Input, Select, Option, MessageStrip,
  FlexBox, FlexBoxJustifyContent,
} from '@ui5/webcomponents-react'
import { useWorkspace, type Project, type SubProject, type Instance } from '../../context/WorkspaceContext'
import { SectionCard, ItemRow, EmptyState, FormField, formBody, titleStyle, subStyle } from './DesignPhase'

const SYSTEM_TYPES = ['DEV', 'QA', 'PRD', 'SBX', 'TRL'] as const
const ROLES        = ['admin', 'developer', 'tester', 'viewer'] as const

interface Member { id: string; project_id: string; user_id: string; role: string; created_at: string }

const SYSTEM_TYPE_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  TRL: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
  SBX: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
  DEV: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
  QA:  { bg: '#fef7e0', text: '#8f6000', border: '#f5c942' },
  PRD: { bg: '#ffeaea', text: '#bb0000', border: '#f5a5a5' },
}

function TypeBadge({ value, colours }: { value: string; colours: Record<string, { bg: string; text: string; border: string }> }) {
  const c = colours[value] ?? { bg: 'var(--sapNeutralBackground)', text: 'var(--sapTextColor)', border: 'var(--sapNeutralBorderColor)' }
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, fontFamily: 'var(--sapFontFamily)', padding: '0.1rem 0.35rem', borderRadius: '3px', background: c.bg, color: c.text, border: `1px solid ${c.border}`, letterSpacing: '0.04em', flexShrink: 0 }}>
      {value}
    </span>
  )
}

function intOrNull(s: string): number | null {
  const n = parseInt(s, 10)
  return !isNaN(n) && n > 0 ? n : null
}

// ── Sub-projects ──────────────────────────────────────────────────────────────

function SubProjectsSection({ project }: { project: Project }) {
  const { subProjects, refreshSubProjects } = useWorkspace()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing,    setEditing]    = useState<SubProject | null>(null)
  const [deleteId,   setDeleteId]   = useState<string | null>(null)
  const [name,       setName]       = useState('')
  const [type,       setType]       = useState<'interface' | 'library'>('interface')
  const [pkgId,      setPkgId]      = useState('')
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  function openCreate() { setEditing(null); setName(''); setType('interface'); setPkgId(''); setError(''); setCreateOpen(true) }
  function openEdit(sp: SubProject) { setEditing(sp); setName(sp.name); setType(sp.type); setPkgId(sp.cpi_package_id ?? ''); setError(''); setCreateOpen(true) }
  function close() { setCreateOpen(false); setEditing(null); setError('') }

  async function save() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(
        editing
          ? `/api/v2/projects/${project.id}/sub-projects/${editing.id}`
          : `/api/v2/projects/${project.id}/sub-projects`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), type, cpi_package_id: pkgId }),
        },
      )
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? res.statusText) }
      await refreshSubProjects()
      close()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteId) return
    await fetch(`/api/v2/projects/${project.id}/sub-projects/${deleteId}`, { method: 'DELETE' })
    await refreshSubProjects()
    setDeleteId(null)
  }

  return (
    <>
      <SectionCard
        title={`Sub-projects — ${project.name}`}
        action={<Button design="Transparent" icon="add" onClick={openCreate}>Add</Button>}
      >
        {subProjects.length === 0
          ? <EmptyState>No sub-projects yet.</EmptyState>
          : subProjects.map(sp => (
            <ItemRow key={sp.id}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={titleStyle}>{sp.name}</span>
                <TypeBadge value={sp.type} colours={{ interface: { bg: '#e8f4fd', text: '#0070d2', border: '#a8d4f5' }, library: { bg: '#f5f0ff', text: '#6c35de', border: '#c9b8f5' } }} />
                {sp.cpi_package_id && <span style={subStyle}>{sp.cpi_package_id}</span>}
              </div>
              <Button design="Transparent" onClick={() => openEdit(sp)}>Edit</Button>
              <Button design="Transparent" onClick={() => setDeleteId(sp.id)}>Delete</Button>
            </ItemRow>
          ))
        }
      </SectionCard>

      <Dialog open={createOpen} headerText={editing ? 'Edit Sub-project' : 'New Sub-project'} onClose={close} style={{ width: '480px', maxWidth: '95vw' }}>
        <div style={formBody}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <FormField label="Name" required>
            <Input value={name} onInput={e => setName((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
          </FormField>
          <FormField label="Type" required>
            <Select style={{ width: '100%' }} onChange={e => setType((e.detail as { selectedOption: { value: string } }).selectedOption.value as 'interface' | 'library')}>
              <Option value="interface" selected={type === 'interface'}>interface — full journey</Option>
              <Option value="library"   selected={type === 'library'}>library — reusable artifacts only</Option>
            </Select>
          </FormField>
          <FormField label="CPI Package ID">
            <Input value={pkgId} onInput={e => setPkgId((e.target as unknown as HTMLInputElement).value)} placeholder="e.g. ZORDERS" style={{ width: '100%' }} />
          </FormField>
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={close}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </FlexBox>
        </Bar>
      </Dialog>

      <Dialog open={!!deleteId} headerText="Delete Sub-project" onClose={() => setDeleteId(null)} style={{ width: '400px', maxWidth: '95vw' }}>
        <div style={formBody}><p style={{ margin: 0, fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem' }}>Delete this sub-project and all its artifacts? This cannot be undone.</p></div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button design="Negative" onClick={confirmDelete}>Delete</Button>
          </FlexBox>
        </Bar>
      </Dialog>
    </>
  )
}

// ── Instances ─────────────────────────────────────────────────────────────────

const DEFAULT_RATE_MON  = '30'
const DEFAULT_RATE_OPS  = '10'
const DEFAULT_RATE_READ = '60'

function InstancesSection({ project }: { project: Project }) {
  const { instances, refreshInstances } = useWorkspace()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing,    setEditing]    = useState<Instance | null>(null)
  const [deleteId,   setDeleteId]   = useState<string | null>(null)
  const [mode,       setMode]       = useState<'fields' | 'json'>('fields')
  const [name,       setName]       = useState('')
  const [url,        setUrl]        = useState('')
  const [tokenUrl,   setTokenUrl]   = useState('')
  const [clientId,   setClientId]   = useState('')
  const [secret,     setSecret]     = useState('')
  const [systemType, setSystemType] = useState<string>('DEV')
  const [piUrl,      setPiUrl]      = useState('')
  const [piTokenUrl, setPiTokenUrl] = useState('')
  const [piClientId, setPiClientId] = useState('')
  const [piSecret,   setPiSecret]   = useState('')
  const [piJsonText, setPiJsonText] = useState('')
  const [piJsonError,setPiJsonError]= useState('')
  const [rateMon,    setRateMon]    = useState(DEFAULT_RATE_MON)
  const [rateOps,    setRateOps]    = useState(DEFAULT_RATE_OPS)
  const [rateRead,   setRateRead]   = useState(DEFAULT_RATE_READ)
  const [jsonText,   setJsonText]   = useState('')
  const [jsonError,  setJsonError]  = useState('')
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  // Parse API service key JSON
  useEffect(() => {
    if (mode !== 'json' || !jsonText.trim()) { setJsonError(''); return }
    try {
      const oauth = (JSON.parse(jsonText) as Record<string, Record<string, string>>).oauth
      if (oauth) {
        if (oauth.url)          setUrl(oauth.url)
        if (oauth.tokenurl)     setTokenUrl(oauth.tokenurl)
        if (oauth.clientid)     setClientId(oauth.clientid)
        if (oauth.clientsecret) setSecret(oauth.clientsecret)
      }
      setJsonError('')
    } catch { setJsonError('Invalid JSON') }
  }, [jsonText, mode])

  // Parse PI service key JSON
  useEffect(() => {
    if (mode !== 'json' || !piJsonText.trim()) { setPiJsonError(''); return }
    try {
      const oauth = (JSON.parse(piJsonText) as Record<string, Record<string, string>>).oauth
      if (oauth) {
        if (oauth.url)          setPiUrl(oauth.url)
        if (oauth.tokenurl)     setPiTokenUrl(oauth.tokenurl)
        if (oauth.clientid)     setPiClientId(oauth.clientid)
        if (oauth.clientsecret) setPiSecret(oauth.clientsecret)
      }
      setPiJsonError('')
    } catch { setPiJsonError('Invalid JSON') }
  }, [piJsonText, mode])

  function openCreate() {
    setEditing(null); setMode('fields')
    setName(''); setUrl(''); setTokenUrl(''); setClientId(''); setSecret(''); setSystemType('DEV')
    setPiUrl(''); setPiTokenUrl(''); setPiClientId(''); setPiSecret('')
    setRateMon(DEFAULT_RATE_MON); setRateOps(DEFAULT_RATE_OPS); setRateRead(DEFAULT_RATE_READ)
    setJsonText(''); setJsonError(''); setPiJsonText(''); setPiJsonError(''); setError('')
    setCreateOpen(true)
  }
  function openEdit(inst: Instance) {
    setEditing(inst); setMode('fields')
    setName(inst.name); setUrl(inst.url); setTokenUrl(inst.token_url); setClientId(inst.client_id); setSecret('')
    setPiUrl(inst.pi_url); setPiTokenUrl(inst.pi_token_url); setPiClientId(inst.pi_client_id); setPiSecret('')
    setSystemType(inst.system_type)
    setRateMon(inst.rate_monitoring?.toString() ?? DEFAULT_RATE_MON)
    setRateOps(inst.rate_operations?.toString() ?? DEFAULT_RATE_OPS)
    setRateRead(inst.rate_read?.toString() ?? DEFAULT_RATE_READ)
    setJsonText(''); setJsonError(''); setError('')
    setCreateOpen(true)
  }
  function close() {
    setCreateOpen(false); setEditing(null); setError('')
    setTokenUrl(''); setJsonText(''); setJsonError('')
    setPiUrl(''); setPiTokenUrl(''); setPiClientId(''); setPiSecret(''); setPiJsonText(''); setPiJsonError('')
  }

  async function save() {
    if (!name.trim() || !url.trim() || !clientId.trim()) { setError('Name, URL and Client ID are required'); return }
    if (!editing && !secret.trim()) { setError('Client Secret is required'); return }
    setSaving(true); setError('')
    try {
      const body: Record<string, unknown> = {
        name: name.trim(), url: url.trim(), token_url: tokenUrl.trim(), client_id: clientId.trim(),
        system_type: systemType,
        pi_url: piUrl.trim(), pi_token_url: piTokenUrl.trim(), pi_client_id: piClientId.trim(),
        rate_monitoring: intOrNull(rateMon),
        rate_operations: intOrNull(rateOps),
        rate_read:       intOrNull(rateRead),
      }
      if (secret.trim())   body.client_secret    = secret.trim()
      if (piSecret.trim()) body.pi_client_secret = piSecret.trim()
      const res = await fetch(
        editing
          ? `/api/v2/projects/${project.id}/instances/${editing.id}`
          : `/api/v2/projects/${project.id}/instances`,
        { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      )
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? res.statusText) }
      await refreshInstances()
      close()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteId) return
    await fetch(`/api/v2/projects/${project.id}/instances/${deleteId}`, { method: 'DELETE' })
    await refreshInstances()
    setDeleteId(null)
  }

  const tabBtn = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{
      fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
      padding: '0.375rem 0.875rem', border: 'none', background: 'none', cursor: 'pointer',
      color: active ? 'var(--sapSelectedColor)' : 'var(--sapContent_LabelColor)',
      borderBottom: active ? '2px solid var(--sapSelectedColor)' : '2px solid transparent',
      fontWeight: active ? 'bold' : 'normal',
    }}>{label}</button>
  )

  return (
    <>
      <SectionCard
        title={`Instances — ${project.name}`}
        action={<Button design="Transparent" icon="add" onClick={openCreate}>Add</Button>}
      >
        {instances.length === 0
          ? <EmptyState>No instances configured. Add one to connect to a CPI tenant.</EmptyState>
          : instances.map(inst => (
            <ItemRow key={inst.id}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={titleStyle}>{inst.name}</span>
                <TypeBadge value={inst.system_type} colours={SYSTEM_TYPE_COLOURS} />
                <span style={{ ...subStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.url}</span>
                {inst.pi_client_id && <TypeBadge value="PI" colours={{ PI: { bg: '#f5f0ff', text: '#6c35de', border: '#c9b8f5' } }} />}
              </div>
              <Button design="Transparent" onClick={() => openEdit(inst)}>Edit</Button>
              <Button design="Transparent" onClick={() => setDeleteId(inst.id)}>Delete</Button>
            </ItemRow>
          ))
        }
      </SectionCard>

      <Dialog open={createOpen} headerText={editing ? 'Edit Instance' : 'New Instance'} onClose={close} style={{ width: '540px', maxWidth: '95vw' }}>
        <div style={{ ...formBody, paddingTop: 0 }}>

          {/* Tab strip */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--sapList_BorderColor)', margin: '0 -1.25rem 0.75rem', padding: '0 1.25rem' }}>
            {tabBtn('Fields', mode === 'fields', () => setMode('fields'))}
            {tabBtn('Paste JSON', mode === 'json', () => setMode('json'))}
          </div>

          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

          {/* Name + system type always visible */}
          <FlexBox style={{ gap: '0.75rem' }}>
            <FormField label="Name" required>
              <Input value={name} onInput={e => setName((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
            </FormField>
            <FormField label="System Type" required>
              <Select onChange={e => setSystemType((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
                {SYSTEM_TYPES.map(t => <Option key={t} value={t} selected={systemType === t}>{t}</Option>)}
              </Select>
            </FormField>
          </FlexBox>

          {/* Fields mode */}
          {mode === 'fields' && <>
            <div style={{ ...subStyle, fontWeight: 'bold', marginBottom: '-0.25rem' }}>API Service Key</div>
            <FormField label="Tenant URL" required>
              <Input value={url} onInput={e => setUrl((e.target as unknown as HTMLInputElement).value)} placeholder="https://mytenant.it-cpi.hana.ondemand.com" style={{ width: '100%' }} />
            </FormField>
            <FormField label="Token URL" required>
              <Input value={tokenUrl} onInput={e => setTokenUrl((e.target as unknown as HTMLInputElement).value)} placeholder="https://mytenant.authentication.eu10.hana.ondemand.com/oauth/token" style={{ width: '100%' }} />
            </FormField>
            <FlexBox style={{ gap: '0.75rem' }}>
              <FormField label="Client ID" required>
                <Input value={clientId} onInput={e => setClientId((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              </FormField>
              <FormField label={editing ? 'Client Secret (blank = keep)' : 'Client Secret'} required={!editing}>
                <Input type="Password" value={secret} onInput={e => setSecret((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              </FormField>
            </FlexBox>
            <div style={{ ...subStyle, fontWeight: 'bold', marginTop: '0.25rem', marginBottom: '-0.25rem' }}>PI Service Key <span style={{ fontWeight: 'normal' }}>(Process Integration — for sending messages to iFlows)</span></div>
            <FormField label="PI URL">
              <Input value={piUrl} onInput={e => setPiUrl((e.target as unknown as HTMLInputElement).value)} placeholder="https://mytenant.it-cpi.hana.ondemand.com" style={{ width: '100%' }} />
            </FormField>
            <FormField label="PI Token URL">
              <Input value={piTokenUrl} onInput={e => setPiTokenUrl((e.target as unknown as HTMLInputElement).value)} placeholder="https://mytenant.authentication.eu10.hana.ondemand.com/oauth/token" style={{ width: '100%' }} />
            </FormField>
            <FlexBox style={{ gap: '0.75rem' }}>
              <FormField label="PI Client ID">
                <Input value={piClientId} onInput={e => setPiClientId((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              </FormField>
              <FormField label={editing ? 'PI Client Secret (blank = keep)' : 'PI Client Secret'}>
                <Input type="Password" value={piSecret} onInput={e => setPiSecret((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              </FormField>
            </FlexBox>
          </>}

          {/* JSON mode */}
          {mode === 'json' && <>
            <FormField label="API Service Key JSON">
              <textarea
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                rows={6}
                placeholder={'{\n  "oauth": {\n    "url": "https://...",\n    "clientid": "sb-...",\n    "clientsecret": "...",\n    "tokenurl": "https://..."\n  }\n}'}
                spellCheck={false}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical', padding: '0.5rem', boxSizing: 'border-box', border: `1px solid ${jsonError ? 'var(--sapErrorBorderColor)' : 'var(--sapField_BorderColor)'}`, borderRadius: '0.25rem', background: 'var(--sapField_Background)', color: 'var(--sapTextColor)' }}
              />
            </FormField>
            {jsonError  && <span style={{ fontSize: '0.75rem', color: 'var(--sapErrorColor)',   fontFamily: 'var(--sapFontFamily)' }}>{jsonError}</span>}
            {!jsonError && url && <span style={{ fontSize: '0.75rem', color: 'var(--sapSuccessColor)', fontFamily: 'var(--sapFontFamily)' }}>✓ API key populated</span>}

            <FormField label="PI Service Key JSON (Process Integration — optional)">
              <textarea
                value={piJsonText}
                onChange={e => setPiJsonText(e.target.value)}
                rows={6}
                placeholder={'{\n  "oauth": {\n    "url": "https://...",\n    "clientid": "sb-...",\n    "clientsecret": "...",\n    "tokenurl": "https://..."\n  }\n}'}
                spellCheck={false}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical', padding: '0.5rem', boxSizing: 'border-box', border: `1px solid ${piJsonError ? 'var(--sapErrorBorderColor)' : 'var(--sapField_BorderColor)'}`, borderRadius: '0.25rem', background: 'var(--sapField_Background)', color: 'var(--sapTextColor)' }}
              />
            </FormField>
            {piJsonError  && <span style={{ fontSize: '0.75rem', color: 'var(--sapErrorColor)',   fontFamily: 'var(--sapFontFamily)' }}>{piJsonError}</span>}
            {!piJsonError && piUrl && <span style={{ fontSize: '0.75rem', color: 'var(--sapSuccessColor)', fontFamily: 'var(--sapFontFamily)' }}>✓ PI key populated</span>}
          </>}

          {/* Rate limits always visible */}
          <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', paddingTop: '0.75rem' }}>
            <div style={{ ...subStyle, marginBottom: '0.5rem' }}>Rate limits (calls/min)</div>
            <FlexBox style={{ gap: '0.75rem' }}>
              <FormField label="Monitoring">
                <Input type="Number" value={rateMon} onInput={e => setRateMon((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              </FormField>
              <FormField label="Operations">
                <Input type="Number" value={rateOps} onInput={e => setRateOps((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              </FormField>
              <FormField label="Read">
                <Input type="Number" value={rateRead} onInput={e => setRateRead((e.target as unknown as HTMLInputElement).value)} style={{ width: '100%' }} />
              </FormField>
            </FlexBox>
          </div>
        </div>

        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={close}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </FlexBox>
        </Bar>
      </Dialog>

      <Dialog open={!!deleteId} headerText="Delete Instance" onClose={() => setDeleteId(null)} style={{ width: '400px', maxWidth: '95vw' }}>
        <div style={formBody}><p style={{ margin: 0, fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem' }}>Remove this instance from the project? The CPI tenant itself is not affected.</p></div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button design="Negative" onClick={confirmDelete}>Delete</Button>
          </FlexBox>
        </Bar>
      </Dialog>
    </>
  )
}

// ── Members ───────────────────────────────────────────────────────────────────

function MembersSection({ project }: { project: Project }) {
  const [members,    setMembers]    = useState<Member[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editing,    setEditing]    = useState<Member | null>(null)
  const [deleteId,   setDeleteId]   = useState<string | null>(null)
  const [userId,     setUserId]     = useState('')
  const [role,       setRole]       = useState<string>('developer')
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/projects/${project.id}/members`)
      if (res.ok) setMembers(await res.json() as Member[])
    } catch { /* silent */ }
  }, [project.id])

  useEffect(() => { loadMembers() }, [loadMembers])

  function openCreate() { setEditing(null); setUserId(''); setRole('developer'); setError(''); setCreateOpen(true) }
  function openEdit(m: Member) { setEditing(m); setUserId(m.user_id); setRole(m.role); setError(''); setCreateOpen(true) }
  function close() { setCreateOpen(false); setEditing(null); setError('') }

  async function save() {
    if (!userId.trim()) { setError('User ID is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(
        editing
          ? `/api/v2/projects/${project.id}/members/${editing.id}`
          : `/api/v2/projects/${project.id}/members`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editing ? { role } : { user_id: userId.trim(), role }),
        },
      )
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? res.statusText) }
      await loadMembers()
      close()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteId) return
    await fetch(`/api/v2/projects/${project.id}/members/${deleteId}`, { method: 'DELETE' })
    await loadMembers()
    setDeleteId(null)
  }

  const ROLE_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
    admin:     { bg: '#ffeaea', text: '#bb0000', border: '#f5a5a5' },
    developer: { bg: '#e8f4fd', text: '#0070d2', border: '#a8d4f5' },
    tester:    { bg: '#fef7e0', text: '#8f6000', border: '#f5c942' },
    viewer:    { bg: 'var(--sapNeutralBackground)', text: 'var(--sapContent_LabelColor)', border: 'var(--sapNeutralBorderColor)' },
  }

  return (
    <>
      <SectionCard
        title={`Roles — ${project.name}`}
        action={<Button design="Transparent" icon="add" onClick={openCreate}>Add Member</Button>}
      >
        {members.length === 0
          ? <EmptyState>No members assigned. Add team members to grant access.</EmptyState>
          : members.map(m => (
            <ItemRow key={m.id}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={titleStyle}>{m.user_id}</span>
                <TypeBadge value={m.role} colours={ROLE_COLOURS} />
              </div>
              <Button design="Transparent" onClick={() => openEdit(m)}>Edit</Button>
              <Button design="Transparent" onClick={() => setDeleteId(m.id)}>Remove</Button>
            </ItemRow>
          ))
        }
      </SectionCard>

      <Dialog open={createOpen} headerText={editing ? 'Edit Member' : 'Add Member'} onClose={close} style={{ width: '420px', maxWidth: '95vw' }}>
        <div style={formBody}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          {!editing && (
            <FormField label="User ID (IAS)" required>
              <Input value={userId} onInput={e => setUserId((e.target as unknown as HTMLInputElement).value)} placeholder="user@example.com or IAS subject ID" style={{ width: '100%' }} />
            </FormField>
          )}
          <FormField label="Role" required>
            <Select style={{ width: '100%' }} onChange={e => setRole((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
              {ROLES.map(r => <Option key={r} value={r} selected={role === r}>{r}</Option>)}
            </Select>
          </FormField>
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={close}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </FlexBox>
        </Bar>
      </Dialog>

      <Dialog open={!!deleteId} headerText="Remove Member" onClose={() => setDeleteId(null)} style={{ width: '400px', maxWidth: '95vw' }}>
        <div style={formBody}><p style={{ margin: 0, fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem' }}>Remove this member from the project? Their IAS account is not affected.</p></div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button design="Negative" onClick={confirmDelete}>Remove</Button>
          </FlexBox>
        </Bar>
      </Dialog>
    </>
  )
}

// ── ProjectSetup: assembles all three sections ────────────────────────────────

export default function ProjectSetup({ project }: { project: Project }) {
  return (
    <>
      <SubProjectsSection project={project} />
      <InstancesSection   project={project} />
      <MembersSection     project={project} />
    </>
  )
}
