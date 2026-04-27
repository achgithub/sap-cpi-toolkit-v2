import { useState, type ReactNode } from 'react'
import {
  TabContainer,
  Tab,
  Label,
  Input,
  TextArea,
  Button,
  Select,
  Option,
  CheckBox,
  Card,
  FlexBox,
  FlexBoxAlignItems,
  MessageStrip,
  BusyIndicator,
} from '@ui5/webcomponents-react'
import type { InputDomRef, CheckBoxDomRef } from '@ui5/webcomponents-react'
import { useWorkspace } from '../context/WorkspaceContext'

// ── shared helpers ────────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  })
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.5rem', alignItems: 'center' }}>
      <Label style={{ fontFamily: 'var(--sapFontFamily)', color: 'var(--sapContent_LabelColor)' }}>
        {label}
      </Label>
      <div>{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' }}>
      {children}
    </div>
  )
}

function field(label: string, children: ReactNode) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <Label style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
        {label}
      </Label>
      {children}
    </div>
  )
}

function ResultBlock({ label, value, filename }: { label: string; value: string; filename: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    copyToClipboard(value); setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Label style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', flex: 1 }}>
          {label}
        </Label>
        <Button icon={copied ? 'accept' : 'copy'} design="Transparent" onClick={copy}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <Button icon="download" design="Transparent" onClick={() => downloadText(filename, value)}>
          Download
        </Button>
      </div>
      <TextArea value={value} readonly rows={8}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.75rem' }} />
    </div>
  )
}

// ── Auth Header ───────────────────────────────────────────────────────────────

function AuthTab() {
  const { selectedProject, selectedInstance } = useWorkspace()
  const [useManual,   setUseManual]   = useState(false)
  const [manualUser,  setManualUser]  = useState('')
  const [manualPass,  setManualPass]  = useState('')
  const [showSecret,  setShowSecret]  = useState(false)
  const [header,      setHeader]      = useState('')
  const [displayId,   setDisplayId]   = useState('')
  const [busy,        setBusy]        = useState(false)
  const [error,       setError]       = useState('')
  const [copied,      setCopied]      = useState(false)

  async function generateFromInstance() {
    if (!selectedProject || !selectedInstance) return
    setBusy(true); setError(''); setHeader(''); setDisplayId('')
    try {
      const res = await fetch(
        `/api/v2/projects/${selectedProject.id}/instances/${selectedInstance.id}/basic-auth`
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { client_id: string; header: string }
      setDisplayId(data.client_id)
      setHeader(data.header)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  function generateManual() {
    if (!manualUser) return
    const encoded = btoa(`${manualUser}:${manualPass}`)
    setHeader(`Basic ${encoded}`)
    setDisplayId('')
    setError('')
  }

  function copy() {
    copyToClipboard(header); setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      {!selectedInstance && (
        <MessageStrip design="Information" hideCloseButton>
          No instance selected — choose one from the context bar.
        </MessageStrip>
      )}

      <Card>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <SectionTitle>Credentials</SectionTitle>

          <CheckBox
            text="Enter credentials manually"
            checked={useManual}
            onChange={(e) => setUseManual((e.target as unknown as CheckBoxDomRef).checked ?? false)}
          />

          {useManual ? (
            <>
              <Row label="Username">
                <Input value={manualUser} placeholder="username or client ID" style={{ width: '100%' }}
                  onInput={(e) => setManualUser((e.target as unknown as InputDomRef).value ?? '')} />
              </Row>
              <Row label="Password">
                <Input value={manualPass} placeholder="password or client secret"
                  type={showSecret ? 'Text' : 'Password'} style={{ width: '100%' }}
                  onInput={(e) => setManualPass((e.target as unknown as InputDomRef).value ?? '')} />
                <Button design="Transparent" onClick={() => setShowSecret(v => !v)} style={{ marginTop: '0.25rem' }}>
                  {showSecret ? 'Hide password' : 'Show password'}
                </Button>
              </Row>
              <Button design="Emphasized" onClick={generateManual} disabled={!manualUser}>
                Generate
              </Button>
            </>
          ) : (
            <>
              <Row label="Instance">
                <span style={{ fontSize: '0.85rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapTextColor)' }}>
                  {selectedInstance ? `${selectedInstance.name} (${selectedInstance.system_type})` : '—'}
                </span>
              </Row>
              {displayId && (
                <Row label="Client ID">
                  <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--sapTextColor)', wordBreak: 'break-all' }}>
                    {displayId}
                  </span>
                </Row>
              )}
              <BusyIndicator active={busy}>
                <Button design="Emphasized" onClick={generateFromInstance} disabled={!selectedInstance || busy}>
                  Generate from instance
                </Button>
              </BusyIndicator>
            </>
          )}
        </div>
      </Card>

      {error && (
        <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>
      )}

      <Card>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <SectionTitle>Generated Header</SectionTitle>
          <div style={{
            fontFamily: 'monospace', fontSize: '0.78rem',
            background: 'var(--sapNeutralBackground)', padding: '0.5rem 0.75rem',
            borderRadius: '4px',
          }}>
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>Authorization:</span>
              <span style={{
                color: header ? 'var(--sapTextColor)' : 'var(--sapContent_LabelColor)',
                wordBreak: 'break-all',
                fontStyle: header ? 'normal' : 'italic',
                flex: 1,
              }}>
                {header ? header.replace('Basic ', '') : 'generate to see value'}
              </span>
            </FlexBox>
          </div>

          {header && (
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
              <Button design="Default" onClick={copy}>
                {copied ? '✓ Copied' : 'Copy full header'}
              </Button>
            </FlexBox>
          )}
        </div>
      </Card>

      <MessageStrip design="Information" hideCloseButton style={{ fontSize: '0.8rem' }}>
        The client secret is never sent to the browser — the server computes the encoded value.
      </MessageStrip>
    </div>
  )
}

// ── PGP ──────────────────────────────────────────────────────────────────────

function PGPTab() {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [bits,    setBits]    = useState('2048')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')
  const [pubKey,  setPubKey]  = useState('')
  const [privKey, setPrivKey] = useState('')

  async function generate() {
    setBusy(true); setError(''); setPubKey(''); setPrivKey('')
    try {
      const res = await fetch('/api/v2/keygen/pgp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, bits: parseInt(bits) }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { public_key: string; private_key: string }
      setPubKey(data.public_key); setPrivKey(data.private_key)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      {field('Name', <Input value={name} onInput={(e) => setName((e.target as unknown as InputDomRef).value ?? '')} style={{ width: '100%' }} />)}
      {field('Email', <Input type="Email" value={email} onInput={(e) => setEmail((e.target as unknown as InputDomRef).value ?? '')} style={{ width: '100%' }} />)}
      {field('Key size',
        <Select style={{ width: '10rem' }} onChange={(e) => setBits((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
          <Option value="2048" selected={bits === '2048'}>2048 bit</Option>
          <Option value="4096" selected={bits === '4096'}>4096 bit</Option>
        </Select>
      )}
      <BusyIndicator active={busy}>
        <Button design="Emphasized" onClick={generate} disabled={!name || busy}>Generate PGP Keypair</Button>
      </BusyIndicator>
      {error && <span style={{ color: 'var(--sapErrorColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>{error}</span>}
      {pubKey  && <ResultBlock label="Public Key"  value={pubKey}  filename="public.asc" />}
      {privKey && <ResultBlock label="Private Key" value={privKey} filename="private.asc" />}
    </div>
  )
}

// ── SSH ───────────────────────────────────────────────────────────────────────

function SSHTab() {
  const [keyType, setKeyType] = useState('ed25519')
  const [comment, setComment] = useState('')
  const [bits,    setBits]    = useState('4096')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')
  const [pubKey,  setPubKey]  = useState('')
  const [privKey, setPrivKey] = useState('')

  async function generate() {
    setBusy(true); setError(''); setPubKey(''); setPrivKey('')
    try {
      const res = await fetch('/api/v2/keygen/ssh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_type: keyType, comment, bits: parseInt(bits) }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { public_key: string; private_key: string }
      setPubKey(data.public_key); setPrivKey(data.private_key)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      {field('Key type',
        <Select style={{ width: '10rem' }} onChange={(e) => setKeyType((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
          <Option value="ed25519" selected={keyType === 'ed25519'}>Ed25519</Option>
          <Option value="rsa"     selected={keyType === 'rsa'}>RSA</Option>
        </Select>
      )}
      {keyType === 'rsa' && field('Key size',
        <Select style={{ width: '10rem' }} onChange={(e) => setBits((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
          <Option value="2048" selected={bits === '2048'}>2048 bit</Option>
          <Option value="4096" selected={bits === '4096'}>4096 bit</Option>
        </Select>
      )}
      {field('Comment (optional)',
        <Input value={comment} placeholder="e.g. user@hostname"
          onInput={(e) => setComment((e.target as unknown as InputDomRef).value ?? '')} style={{ width: '100%' }} />
      )}
      <BusyIndicator active={busy}>
        <Button design="Emphasized" onClick={generate} disabled={busy}>Generate SSH Keypair</Button>
      </BusyIndicator>
      {error && <span style={{ color: 'var(--sapErrorColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>{error}</span>}
      {pubKey  && <ResultBlock label="Public Key (authorized_keys format)" value={pubKey}  filename="id_ed25519.pub" />}
      {privKey && <ResultBlock label="Private Key"                         value={privKey} filename="id_ed25519" />}
    </div>
  )
}

// ── Certificate ───────────────────────────────────────────────────────────────

function CertTab() {
  const [cn,       setCN]       = useState('')
  const [org,      setOrg]      = useState('')
  const [sans,     setSANs]     = useState('')
  const [validity, setValidity] = useState('90')
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [cert,     setCert]     = useState('')
  const [privKey,  setPrivKey]  = useState('')

  async function generate() {
    setBusy(true); setError(''); setCert(''); setPrivKey('')
    const sanList = sans.split(',').map(s => s.trim()).filter(Boolean)
    try {
      const res = await fetch('/api/v2/keygen/cert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ common_name: cn, org, sans: sanList, validity_days: parseInt(validity) || 90 }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { certificate: string; private_key: string }
      setCert(data.certificate); setPrivKey(data.private_key)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      {field('Common Name (CN)', <Input value={cn} onInput={(e) => setCN((e.target as unknown as InputDomRef).value ?? '')} style={{ width: '100%' }} />)}
      {field('Organisation (optional)', <Input value={org} onInput={(e) => setOrg((e.target as unknown as InputDomRef).value ?? '')} style={{ width: '100%' }} />)}
      {field('SANs — comma-separated DNS names',
        <Input value={sans} placeholder="e.g. example.com, www.example.com"
          onInput={(e) => setSANs((e.target as unknown as InputDomRef).value ?? '')} style={{ width: '100%' }} />
      )}
      {field('Validity (days, max 90)',
        <Input type="Number" value={validity}
          onInput={(e) => setValidity((e.target as unknown as InputDomRef).value ?? '90')} style={{ width: '8rem' }} />
      )}
      <BusyIndicator active={busy}>
        <Button design="Emphasized" onClick={generate} disabled={!cn || busy}>Generate Certificate</Button>
      </BusyIndicator>
      {error && <span style={{ color: 'var(--sapErrorColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>{error}</span>}
      {cert    && <ResultBlock label="Certificate (PEM)"  value={cert}    filename="cert.pem" />}
      {privKey && <ResultBlock label="Private Key (PEM)"  value={privKey} filename="cert.key" />}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Security() {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TabContainer style={{ height: '100%' }}>
        <Tab text="Auth Header"><AuthTab /></Tab>
        <Tab text="PGP"><PGPTab /></Tab>
        <Tab text="SSH"><SSHTab /></Tab>
        <Tab text="Certificate"><CertTab /></Tab>
      </TabContainer>
    </div>
  )
}
