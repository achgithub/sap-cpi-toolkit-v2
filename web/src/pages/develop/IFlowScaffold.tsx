import { useState } from 'react'
import {
  Button, Card, CardHeader, CheckBox, FlexBox, FlexBoxAlignItems, FlexBoxJustifyContent,
  Input, Label, MessageStrip, Option, Select, TextArea,
} from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import AssetBrowser from '../../components/AssetBrowser'

// ── Constants ──────────────────────────────────────────────────────────────────

const RESTRICTED_TYPES  = ['QA', 'PRD']
const ALLOWED_LABEL     = 'TRL, SBX, DEV'
const SENDER_ADAPTERS   = ['HTTPS', 'SFTP']
const RECEIVER_ADAPTERS = ['HTTP', 'SFTP']
const SCHEDULE_TYPES    = [
  { value: 'every_minutes', label: 'Every N minutes' },
  { value: 'every_hours',   label: 'Every N hours'   },
  { value: 'daily',         label: 'Daily at time'   },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function toScreamingSnakeCase(s: string): string {
  return s.toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^[^A-Z]+/, '')
    .replace(/_$/g, '')
}

function inp(e: { target: unknown }): string {
  return (e.target as unknown as InputDomRef).value ?? ''
}

function sel(e: { detail: { selectedOption: { value?: string } } }): string {
  return e.detail.selectedOption.value ?? ''
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function IFlowScaffold() {
  const { selectedInstance, selectedProject } = useWorkspace()

  const isRestricted = selectedInstance ? RESTRICTED_TYPES.includes(selectedInstance.system_type) : false
  const noInstance   = !selectedInstance
  const noProject    = !selectedProject

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>

      {/* Hard guardrail overlay */}
      {isRestricted && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(30, 30, 30, 0.72)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--sapList_Background)',
            border: '2px solid var(--sapNegativeColor)',
            borderRadius: '8px', padding: '2rem 2.5rem',
            maxWidth: '480px', textAlign: 'center',
            fontFamily: 'var(--sapFontFamily)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🚫</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--sapNegativeColor)', marginBottom: '0.75rem' }}>
              Not Available for this Environment
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--sapTextColor)', lineHeight: 1.6, marginBottom: '1rem' }}>
              iFlow Scaffold is restricted to <strong>development environments ({ALLOWED_LABEL})</strong>.
            </div>
            <div style={{
              display: 'inline-block', padding: '0.35rem 1rem', borderRadius: '4px',
              background: 'var(--sapNegativeBackground)', color: 'var(--sapNegativeColor)',
              fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.06em', marginBottom: '1rem',
            }}>
              {selectedInstance?.system_type} — NOT PERMITTED
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
              This tool must not be used with QA or PRD systems.<br/>
              Switch the instance in the context bar to a development system to continue.
            </div>
          </div>
        </div>
      )}

      {/* Page content */}
      <div style={{
        height: '100%', overflowY: 'auto', padding: '1.5rem', boxSizing: 'border-box',
        pointerEvents: isRestricted ? 'none' : 'auto',
      }}>
        {(noProject || noInstance) && (
          <MessageStrip design="Information" hideCloseButton style={{ marginBottom: '1rem' }}>
            {noProject
              ? 'No project selected — choose a project from the context bar.'
              : 'No CPI instance selected — choose one from the context bar.'}
          </MessageStrip>
        )}
        <ScaffoldForm instanceId={selectedInstance?.id ?? ''} disabled={noInstance || noProject} />
      </div>
    </div>
  )
}

// ── Form ───────────────────────────────────────────────────────────────────────

interface FormState {
  name:            string
  iflowId:         string
  packageName:     string
  packageId:       string
  description:     string
  senderAdapter:   string
  receiverAdapter: string
  includeGroovy:   boolean
  groovyName:      string
  groovyContent:   string
  includeXSLT:     boolean
  xsltName:        string
  xsltContent:     string
  httpsUrlPath:             string
  sftpSenderHost:           string
  sftpSenderCredential:     string
  sftpSenderDirectory:      string
  sftpSenderScheduleType:   string
  sftpSenderScheduleValue:  string
  httpReceiverUrl:          string
  httpReceiverCredential:   string
  sftpReceiverHost:         string
  sftpReceiverPrivateKey:   string
  sftpReceiverUsername:     string
  sftpReceiverDirectory:    string
}

function ScaffoldForm({ instanceId, disabled }: { instanceId: string; disabled: boolean }) {
  const [step,       setStep]       = useState(1)
  const [generating, setGenerating] = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [checking,   setChecking]   = useState(false)
  const [error,      setError]      = useState('')
  const [uploadMsg,  setUploadMsg]  = useState('')
  const [browseFor,  setBrowseFor]  = useState<'groovy'|'xslt'|null>(null)
  const [preflight,  setPreflight]  = useState<{
    package_id: string; package_exists: boolean
    iflow_id: string; iflow_exists: boolean
  } | null>(null)

  const [form, setForm] = useState<FormState>({
    name: '', iflowId: '', packageName: '', packageId: '',
    description: '', senderAdapter: 'HTTPS', receiverAdapter: 'HTTP',
    includeGroovy: false, groovyName: 'script', groovyContent: '',
    includeXSLT: false, xsltName: 'mapping', xsltContent: '',
    httpsUrlPath: 'ZZURLPATH',
    sftpSenderHost: 'ZZHOST', sftpSenderCredential: 'ZZCREDENTIALNAME', sftpSenderDirectory: 'ZZDIRECTORY',
    sftpSenderScheduleType: 'every_hours', sftpSenderScheduleValue: '1',
    httpReceiverUrl: 'ZZURL', httpReceiverCredential: 'ZZCREDENTIALNAME',
    sftpReceiverHost: 'ZZHOST', sftpReceiverPrivateKey: 'ZZPRIVATEKEYALIAS',
    sftpReceiverUsername: 'ZZUSERNAME', sftpReceiverDirectory: 'ZZDIRECTORY',
  })

  const patch = (p: Partial<FormState>) => setForm(prev => ({ ...prev, ...p }))

  const buildPayload = () => ({
    instance_id: instanceId,
    name: form.name, iflow_id: form.iflowId,
    package_name: form.packageName, package_id: form.packageId,
    description: form.description,
    sender_adapter: form.senderAdapter, receiver_adapter: form.receiverAdapter,
    include_groovy: form.includeGroovy, groovy_name: form.groovyName || 'script', groovy_content: form.groovyContent,
    include_xslt: form.includeXSLT, xslt_name: form.xsltName || 'mapping', xslt_content: form.xsltContent,
    https_url_path: form.httpsUrlPath,
    sftp_sender_host: form.sftpSenderHost, sftp_sender_credential: form.sftpSenderCredential,
    sftp_sender_directory: form.sftpSenderDirectory,
    sftp_sender_schedule_type: form.sftpSenderScheduleType, sftp_sender_schedule_value: form.sftpSenderScheduleValue,
    http_receiver_url: form.httpReceiverUrl, http_receiver_credential: form.httpReceiverCredential,
    sftp_receiver_host: form.sftpReceiverHost, sftp_receiver_private_key: form.sftpReceiverPrivateKey,
    sftp_receiver_username: form.sftpReceiverUsername, sftp_receiver_directory: form.sftpReceiverDirectory,
  })

  const canAdvance = () => step === 1
    ? form.name.trim() !== '' && form.iflowId.trim() !== ''
    : true

  const checkBeforeUpload = async () => {
    setChecking(true); setError(''); setPreflight(null); setUploadMsg('')
    try {
      const res = await fetch('/api/v2/scaffold/preflight', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText)
      setPreflight(data as typeof preflight)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setChecking(false) }
  }

  const confirmUpload = async () => {
    setUploading(true); setError(''); setUploadMsg('')
    try {
      const res = await fetch('/api/v2/scaffold/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json() as { error?: string; message?: string }
      if (!res.ok) throw new Error(data.error ?? res.statusText)
      setUploadMsg(data.message ?? 'Uploaded successfully')
      setPreflight(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setUploading(false) }
  }

  const download = async () => {
    setGenerating(true); setError('')
    try {
      const res = await fetch('/api/v2/scaffold/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? res.statusText)
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = form.iflowId + '.zip'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setGenerating(false) }
  }

  const scheduleLabel = () => {
    const t = form.sftpSenderScheduleType, v = form.sftpSenderScheduleValue
    if (t === 'every_minutes') return `Every ${v || '30'} minutes (UTC)`
    if (t === 'daily') return `Daily at ${v || '08:00'} UTC`
    return `Every ${v || '1'} hour(s) (UTC)`
  }

  const adapterProps: [string, string][] = []
  if (form.senderAdapter === 'HTTPS') {
    adapterProps.push(['HTTPS URL Path', form.httpsUrlPath])
  } else if (form.senderAdapter === 'SFTP') {
    adapterProps.push(['SFTP Sender Host', form.sftpSenderHost])
    adapterProps.push(['SFTP Sender Credential', form.sftpSenderCredential])
    adapterProps.push(['SFTP Sender Directory', form.sftpSenderDirectory])
    adapterProps.push(['SFTP Schedule', scheduleLabel()])
  }
  if (form.receiverAdapter === 'HTTP') {
    adapterProps.push(['HTTP Receiver URL', form.httpReceiverUrl])
    adapterProps.push(['HTTP Receiver Credential', form.httpReceiverCredential])
  } else if (form.receiverAdapter === 'SFTP') {
    adapterProps.push(['SFTP Receiver Host', form.sftpReceiverHost])
    adapterProps.push(['SFTP Receiver Private Key', form.sftpReceiverPrivateKey])
    adapterProps.push(['SFTP Receiver Username', form.sftpReceiverUsername])
    adapterProps.push(['SFTP Receiver Directory', form.sftpReceiverDirectory])
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <StepIndicator current={step} />

      {/* Step 1: Identity */}
      {step === 1 && (
        <FormSection title="1 — Identity" subtitle="iFlow name, ID and package">
          <FormRow label="iFlow Display Name" required>
            <Input value={form.name} placeholder="e.g. SFTP to HTTP - Orders"
              style={{ width: '100%' }} disabled={disabled}
              onInput={e => patch({ name: inp(e), iflowId: toScreamingSnakeCase(inp(e)) })} />
          </FormRow>
          <FormRow label="iFlow ID" required hint="Auto-generated, editable — must start with letter or underscore">
            <Input value={form.iflowId} placeholder="SFTP_TO_HTTP_ORDERS"
              style={{ width: '100%', fontFamily: 'monospace' }} disabled={disabled}
              onInput={e => patch({ iflowId: inp(e) })} />
          </FormRow>
          <FormRow label="Package Name">
            <Input value={form.packageName} placeholder="e.g. Orders Integration"
              style={{ width: '100%' }} disabled={disabled}
              onInput={e => patch({ packageName: inp(e), packageId: toScreamingSnakeCase(inp(e)) })} />
          </FormRow>
          <FormRow label="Package ID" hint="Auto-generated, editable">
            <Input value={form.packageId} placeholder="ORDERS_INTEGRATION"
              style={{ width: '100%', fontFamily: 'monospace' }} disabled={disabled}
              onInput={e => patch({ packageId: inp(e) })} />
          </FormRow>
          <FormRow label="Description">
            <TextArea value={form.description} rows={2} style={{ width: '100%' }}
              placeholder="One sentence — what does this interface do?"
              onInput={e => patch({ description: (e.target as unknown as HTMLTextAreaElement).value })} />
          </FormRow>
        </FormSection>
      )}

      {/* Step 2: Pattern */}
      {step === 2 && (
        <FormSection title="2 — Pattern" subtitle="Sender and receiver adapter configuration">
          <FormRow label="Sender Adapter">
            <Select style={{ minWidth: '160px' }}
              onChange={e => patch({ senderAdapter: sel(e) })}>
              {SENDER_ADAPTERS.map(a => <Option key={a} value={a} selected={form.senderAdapter === a}>{a}</Option>)}
            </Select>
          </FormRow>
          <FormRow label="Receiver Adapter">
            <Select style={{ minWidth: '160px' }}
              onChange={e => patch({ receiverAdapter: sel(e) })}>
              {RECEIVER_ADAPTERS.map(a => <Option key={a} value={a} selected={form.receiverAdapter === a}>{a}</Option>)}
            </Select>
          </FormRow>
          <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--sapNeutralBackground)', borderRadius: '4px', fontSize: '0.82rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
            <strong style={{ color: 'var(--sapTextColor)' }}>Pattern:</strong> {form.senderAdapter} → Integration Process → {form.receiverAdapter}
            &nbsp;&nbsp;<strong style={{ color: 'var(--sapTextColor)' }}>Type:</strong> Async
          </div>
          {(form.senderAdapter === 'SFTP' || form.receiverAdapter === 'SFTP') && (
            <MessageStrip design="Information" hideCloseButton style={{ marginTop: '0.5rem' }}>
              SFTP: After import, verify <strong>Proxy Type</strong> (Internet vs On-Premise) in the adapter before deploying.
            </MessageStrip>
          )}

          <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', marginTop: '0.5rem', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <SectionLabel>Sender Properties</SectionLabel>
            {form.senderAdapter === 'HTTPS' && (
              <FormRow label="URL Path" hint="e.g. /http/my-endpoint">
                <Input value={form.httpsUrlPath} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ httpsUrlPath: inp(e) })} />
              </FormRow>
            )}
            {form.senderAdapter === 'SFTP' && (<>
              <FormRow label="Host">
                <Input value={form.sftpSenderHost} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ sftpSenderHost: inp(e) })} />
              </FormRow>
              <FormRow label="Credential Name" hint="Security Material alias">
                <Input value={form.sftpSenderCredential} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ sftpSenderCredential: inp(e) })} />
              </FormRow>
              <FormRow label="Directory">
                <Input value={form.sftpSenderDirectory} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ sftpSenderDirectory: inp(e) })} />
              </FormRow>
              <FormRow label="Schedule" hint="Runs in UTC">
                <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Select style={{ minWidth: '160px' }}
                    onChange={e => {
                      const t = sel(e)
                      patch({ sftpSenderScheduleType: t, sftpSenderScheduleValue: t === 'daily' ? '08:00' : t === 'every_minutes' ? '30' : '1' })
                    }}>
                    {SCHEDULE_TYPES.map(s => <Option key={s.value} value={s.value} selected={form.sftpSenderScheduleType === s.value}>{s.label}</Option>)}
                  </Select>
                  {form.sftpSenderScheduleType === 'daily' ? (
                    <Input value={form.sftpSenderScheduleValue} placeholder="08:00" style={{ width: '90px', fontFamily: 'monospace' }}
                      onInput={e => patch({ sftpSenderScheduleValue: inp(e) })} />
                  ) : (
                    <Input type="Number" value={form.sftpSenderScheduleValue} style={{ width: '70px', fontFamily: 'monospace' }}
                      onInput={e => patch({ sftpSenderScheduleValue: inp(e) })} />
                  )}
                  <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
                    {form.sftpSenderScheduleType === 'every_minutes' ? 'minutes' : form.sftpSenderScheduleType === 'every_hours' ? 'hours' : 'UTC (HH:MM)'}
                  </span>
                </FlexBox>
              </FormRow>
            </>)}
          </div>

          <div style={{ borderTop: '1px solid var(--sapList_BorderColor)', marginTop: '0.25rem', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <SectionLabel>Receiver Properties</SectionLabel>
            {form.receiverAdapter === 'HTTP' && (<>
              <FormRow label="URL" hint="Full target endpoint URL">
                <Input value={form.httpReceiverUrl} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ httpReceiverUrl: inp(e) })} />
              </FormRow>
              <FormRow label="Credential Name" hint="Security Material alias">
                <Input value={form.httpReceiverCredential} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ httpReceiverCredential: inp(e) })} />
              </FormRow>
            </>)}
            {form.receiverAdapter === 'SFTP' && (<>
              <FormRow label="Host">
                <Input value={form.sftpReceiverHost} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ sftpReceiverHost: inp(e) })} />
              </FormRow>
              <FormRow label="Private Key Alias" hint="Security Material alias">
                <Input value={form.sftpReceiverPrivateKey} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ sftpReceiverPrivateKey: inp(e) })} />
              </FormRow>
              <FormRow label="Username">
                <Input value={form.sftpReceiverUsername} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ sftpReceiverUsername: inp(e) })} />
              </FormRow>
              <FormRow label="Directory">
                <Input value={form.sftpReceiverDirectory} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => patch({ sftpReceiverDirectory: inp(e) })} />
              </FormRow>
            </>)}
          </div>
        </FormSection>
      )}

      {/* Asset browser for Groovy / XSLT */}
      <AssetBrowser
        open={browseFor === 'groovy'}
        filterType="groovy"
        title="Load Groovy Script"
        onSelect={(content) => { patch({ groovyContent: content }); setBrowseFor(null) }}
        onClose={() => setBrowseFor(null)}
      />
      <AssetBrowser
        open={browseFor === 'xslt'}
        filterType="xslt"
        title="Load XSLT Mapping"
        onSelect={(content) => { patch({ xsltContent: content }); setBrowseFor(null) }}
        onClose={() => setBrowseFor(null)}
      />

      {/* Step 3: Flow Steps */}
      {step === 3 && (
        <FormSection title="3 — Flow Steps" subtitle="Optional script and mapping files included in the ZIP">
          <LockedStep label="Exception Subprocess"
            description="Always included — catches unhandled errors and sets exception message as body." />
          <LockedStep label="Content Modifier — Set Standard Headers"
            description="Always included — sets SAP_ApplicationID with timestamp and exchange ID." />

          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Groovy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <CheckBox text="Include Groovy Script" checked={form.includeGroovy}
                onChange={e => patch({ includeGroovy: (e.target as unknown as { checked: boolean }).checked, groovyContent: '' })} />
              {form.includeGroovy && (
                <div style={{ paddingLeft: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                    <Label>Filename:</Label>
                    <Input value={form.groovyName} placeholder="script" style={{ width: '180px', fontFamily: 'monospace' }}
                      onInput={e => patch({ groovyName: inp(e) })} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'monospace' }}>.groovy</span>
                  </FlexBox>
                  <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                    <Button icon="open-folder" design="Transparent" onClick={() => setBrowseFor('groovy')}>
                      Load from Asset Library
                    </Button>
                    {form.groovyContent ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--sapPositiveColor)' }}>
                        ✓ Script loaded ({form.groovyContent.split('\n').length} lines) — will be embedded in ZIP
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                        No script loaded — a stub will be generated
                      </span>
                    )}
                    {form.groovyContent && (
                      <Button design="Transparent" icon="decline" onClick={() => patch({ groovyContent: '' })}>Clear</Button>
                    )}
                  </FlexBox>
                </div>
              )}
            </div>

            {/* XSLT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <CheckBox text="Include XSLT Mapping" checked={form.includeXSLT}
                onChange={e => patch({ includeXSLT: (e.target as unknown as { checked: boolean }).checked, xsltContent: '' })} />
              {form.includeXSLT && (
                <div style={{ paddingLeft: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                    <Label>Filename:</Label>
                    <Input value={form.xsltName} placeholder="mapping" style={{ width: '180px', fontFamily: 'monospace' }}
                      onInput={e => patch({ xsltName: inp(e) })} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'monospace' }}>.xsl</span>
                  </FlexBox>
                  <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                    <Button icon="open-folder" design="Transparent" onClick={() => setBrowseFor('xslt')}>
                      Load from Asset Library
                    </Button>
                    {form.xsltContent ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--sapPositiveColor)' }}>
                        ✓ Mapping loaded ({form.xsltContent.split('\n').length} lines) — will be embedded in ZIP
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                        No mapping loaded — a stub will be generated
                      </span>
                    )}
                    {form.xsltContent && (
                      <Button design="Transparent" icon="decline" onClick={() => patch({ xsltContent: '' })}>Clear</Button>
                    )}
                  </FlexBox>
                </div>
              )}
            </div>
          </div>
        </FormSection>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <FormSection title="4 — Review & Download" subtitle="Confirm settings, then generate the iFlow ZIP or upload to tenant">
          <SummaryTable rows={[
            ['iFlow Name',   form.name],
            ['iFlow ID',     form.iflowId],
            ['Package',      form.packageName ? `${form.packageName} (${form.packageId})` : '—'],
            ['Description',  form.description || '—'],
            ['Sender',       form.senderAdapter],
            ['Receiver',     form.receiverAdapter],
            ['Groovy',  form.includeGroovy ? `${form.groovyName || 'script'}.groovy${form.groovyContent ? ' (from asset)' : ' (stub)'}` : 'No'],
            ['XSLT',    form.includeXSLT   ? `${form.xsltName   || 'mapping'}.xsl${form.xsltContent   ? ' (from asset)' : ' (stub)'}` : 'No'],
          ]} />

          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapTextColor)' }}>
              Adapter Configuration
            </div>
            {adapterProps.map(([label, value]) => {
              const isZZ = value.startsWith('ZZ')
              return (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', padding: '0.35rem 0', borderBottom: '1px solid var(--sapList_BorderColor)', fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)', alignItems: 'center' }}>
                  <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontFamily: 'monospace', color: isZZ ? 'var(--sapWarningColor)' : 'var(--sapTextColor)', fontWeight: isZZ ? 600 : 400 }}>
                    {value}
                    {isZZ && <span style={{ fontFamily: 'var(--sapFontFamily)', fontWeight: 400, fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginLeft: '0.5rem' }}>— fill in CPI after import</span>}
                  </span>
                </div>
              )
            })}
          </div>

          {error     && <MessageStrip design="Negative" style={{ marginTop: '1rem' }} onClose={() => setError('')}>{error}</MessageStrip>}
          {uploadMsg && <MessageStrip design="Positive" style={{ marginTop: '1rem' }} onClose={() => setUploadMsg('')}>{uploadMsg}</MessageStrip>}

          {preflight && (
            <div style={{ marginTop: '1rem', padding: '0.875rem 1rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: '6px', background: 'var(--sapNeutralBackground)', fontFamily: 'var(--sapFontFamily)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--sapTextColor)' }}>
                Confirm upload to tenant
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                <PreflightLine label="Package" id={preflight.package_id} exists={preflight.package_exists} createMsg="will be created" existsMsg="already exists" />
                <PreflightLine label="iFlow"   id={preflight.iflow_id}   exists={preflight.iflow_exists}   createMsg="will be created" existsMsg="will be updated (overwrite)" />
              </div>
              <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                <Button design="Emphasized" onClick={confirmUpload} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Confirm Upload'}
                </Button>
                <Button design="Transparent" onClick={() => setPreflight(null)} disabled={uploading}>Cancel</Button>
              </FlexBox>
            </div>
          )}

          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button design="Emphasized" onClick={download}
              disabled={generating || uploading || disabled || !form.iflowId}>
              {generating ? 'Generating…' : `⬇ Download ${form.iflowId}.zip`}
            </Button>
            {!preflight && (
              <Button design="Default" onClick={checkBeforeUpload}
                disabled={checking || uploading || generating || disabled || !form.iflowId || !form.packageId}>
                {checking ? 'Checking…' : '↑ Upload to Tenant'}
              </Button>
            )}
          </FlexBox>
        </FormSection>
      )}

      <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
        style={{ marginTop: '1.25rem' }}>
        <Button design="Transparent" disabled={step === 1} onClick={() => setStep(s => s - 1)}>← Back</Button>
        {step < 4 && (
          <Button design="Emphasized" disabled={!canAdvance() || disabled} onClick={() => setStep(s => s + 1)}>Next →</Button>
        )}
      </FlexBox>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  const labels = ['Identity', 'Pattern', 'Steps', 'Review']
  return (
    <div style={{ display: 'flex', marginBottom: '1.5rem', borderBottom: '2px solid var(--sapList_BorderColor)', paddingBottom: '0.75rem' }}>
      {labels.map((label, i) => {
        const n = i + 1, active = n === current, done = n < current
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '1.5rem' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--sapFontFamily)',
              background: done ? 'var(--sapSuccessColor)' : active ? 'var(--sapHighlightColor)' : 'var(--sapNeutralBackground)',
              color: (done || active) ? '#fff' : 'var(--sapContent_LabelColor)',
            }}>
              {done ? '✓' : n}
            </div>
            <span style={{ fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)', fontWeight: active ? 600 : 400, color: active ? 'var(--sapTextColor)' : 'var(--sapContent_LabelColor)' }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card header={<CardHeader titleText={title} subtitleText={subtitle} />}>
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {children}
      </div>
    </Card>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </div>
  )
}

function FormRow({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '0.5rem', alignItems: 'start' }}>
      <div>
        <Label style={{ fontFamily: 'var(--sapFontFamily)' }}>
          {label}{required && <span style={{ color: 'var(--sapNegativeColor)' }}> *</span>}
        </Label>
        {hint && <div style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginTop: '0.1rem' }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function LockedStep({ label, description }: { label: string; description: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--sapSuccessBackground)', borderRadius: '4px', border: '1px solid var(--sapSuccessBorderColor)' }}>
      <span style={{ color: 'var(--sapSuccessColor)', flexShrink: 0 }}>✓</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>{description}</div>
      </div>
    </div>
  )
}

function PreflightLine({ label, id, exists, createMsg, existsMsg }: { label: string; id: string; exists: boolean; createMsg: string; existsMsg: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.82rem', alignItems: 'center' }}>
      <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: '52px' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', color: 'var(--sapTextColor)' }}>{id}</span>
      <span style={{
        padding: '0.1rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem',
        background: exists ? 'var(--sapWarningBackground)' : 'var(--sapSuccessBackground)',
        color: exists ? 'var(--sapWarningColor)' : 'var(--sapSuccessColor)',
        border: `1px solid ${exists ? 'var(--sapWarningBorderColor)' : 'var(--sapSuccessBorderColor)'}`,
      }}>
        {exists ? existsMsg : createMsg}
      </span>
    </div>
  )
}

function SummaryTable({ rows }: { rows: [string, string][] }) {
  return (
    <div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', padding: '0.4rem 0', borderBottom: '1px solid var(--sapList_BorderColor)', fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)' }}>
          <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>{k}</span>
          <span style={{ color: 'var(--sapTextColor)' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
