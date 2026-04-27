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
  MessageStrip,
} from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import { useWorkspace } from '../context/WorkspaceContext'

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

// ── Basic Auth ────────────────────────────────────────────────────────────────

function BasicTab() {
  const { selectedInstance } = useWorkspace()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [result,   setResult]   = useState('')
  const [copied,   setCopied]   = useState(false)

  function prefill() {
    if (selectedInstance) {
      setUsername(selectedInstance.client_id)
      setPassword('')
    }
  }

  function generate() {
    if (!username) return
    const encoded = btoa(`${username}:${password}`)
    setResult(`Authorization: Basic ${encoded}`)
    setCopied(false)
  }

  function copy() {
    copyToClipboard(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      {selectedInstance && (
        <MessageStrip design="Information" hideCloseButton>
          Selected instance: <strong>{selectedInstance.name}</strong>
          <Button design="Transparent" style={{ marginLeft: '0.5rem' }} onClick={prefill}>
            Prefill from instance
          </Button>
        </MessageStrip>
      )}
      {field('Username / Client ID',
        <Input
          value={username}
          onInput={(e) => setUsername((e.target as unknown as InputDomRef).value ?? '')}
          style={{ width: '100%' }}
        />
      )}
      {field('Password / Client Secret',
        <Input
          type="Password"
          value={password}
          onInput={(e) => setPassword((e.target as unknown as InputDomRef).value ?? '')}
          style={{ width: '100%' }}
        />
      )}
      <Button design="Emphasized" onClick={generate} disabled={!username}>
        Generate
      </Button>
      {result && (
        <>
          {field('Result',
            <TextArea value={result} readonly rows={2} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }} />
          )}
          <Button icon={copied ? 'accept' : 'copy'} design="Transparent" onClick={copy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </>
      )}
    </div>
  )
}

// ── Bearer Token ──────────────────────────────────────────────────────────────

function BearerTab() {
  const [token,  setToken]  = useState('')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)

  function generate() {
    if (!token) return
    setResult(`Authorization: Bearer ${token.trim()}`)
    setCopied(false)
  }

  function copy() {
    copyToClipboard(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      {field('Token',
        <TextArea
          value={token}
          onInput={(e) => setToken((e.target as unknown as HTMLTextAreaElement).value ?? '')}
          rows={4}
          placeholder="Paste your bearer token here…"
          style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
        />
      )}
      <Button design="Emphasized" onClick={generate} disabled={!token}>
        Generate
      </Button>
      {result && (
        <>
          {field('Result',
            <TextArea value={result} readonly rows={2} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }} />
          )}
          <Button icon={copied ? 'accept' : 'copy'} design="Transparent" onClick={copy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </>
      )}
    </div>
  )
}

// ── Custom Header ─────────────────────────────────────────────────────────────

const COMMON_HEADERS = [
  'Authorization',
  'X-API-Key',
  'X-Auth-Token',
  'X-Custom-Header',
]

function CustomTab() {
  const [headerName, setHeaderName] = useState('Authorization')
  const [value,      setValue]      = useState('')
  const [result,     setResult]     = useState('')
  const [copied,     setCopied]     = useState(false)

  function generate() {
    if (!headerName || !value) return
    setResult(`${headerName}: ${value.trim()}`)
    setCopied(false)
  }

  function copy() {
    copyToClipboard(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      {field('Header Name',
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Select
            style={{ minWidth: '12rem' }}
            onChange={(e) => setHeaderName((e.detail as { selectedOption: { value: string } }).selectedOption.value)}
          >
            {COMMON_HEADERS.map(h => (
              <Option key={h} value={h} selected={headerName === h}>{h}</Option>
            ))}
          </Select>
          <Input
            value={headerName}
            placeholder="Or type a custom header"
            onInput={(e) => setHeaderName((e.target as unknown as InputDomRef).value ?? '')}
            style={{ flex: 1 }}
          />
        </div>
      )}
      {field('Value',
        <Input
          value={value}
          onInput={(e) => setValue((e.target as unknown as InputDomRef).value ?? '')}
          style={{ width: '100%' }}
        />
      )}
      <Button design="Emphasized" onClick={generate} disabled={!headerName || !value}>
        Generate
      </Button>
      {result && (
        <>
          {field('Result',
            <TextArea value={result} readonly rows={2} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }} />
          )}
          <Button icon={copied ? 'accept' : 'copy'} design="Transparent" onClick={copy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AuthHeaderGen() {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <TabContainer style={{ height: '100%' }}>
        <Tab text="Basic Auth"><BasicTab /></Tab>
        <Tab text="Bearer Token"><BearerTab /></Tab>
        <Tab text="Custom Header"><CustomTab /></Tab>
      </TabContainer>
    </div>
  )
}
