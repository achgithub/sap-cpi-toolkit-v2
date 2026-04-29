import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Button, Card, CardHeader, FlexBox, FlexBoxDirection,
  Icon, Input, Label, MessageStrip, Option, Select,
  TextArea, Toolbar, ToolbarSpacer,
} from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import AssetBrowser from '../components/AssetBrowser'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SFTPConfig {
  auth_mode: string
  username: string
  password_masked: string
  password_set: boolean
  authorized_keys: string
  ssh_host_key_fingerprint: string
}

interface SFTPEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size: number
  mod_time: string
  permissions: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const API = '/api/v2/sftp-server'

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  if (res.status === 204 || res.status === 201) return null
  return res.json()
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleString('en-GB', { month: 'short' })
  const time  = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${day} ${month}  ${time}`
}

function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`
}

// ── Grid layout constants ─────────────────────────────────────────────────────

const COLS = 'minmax(0, 1fr) 90px 160px 5rem'

const ROW_STYLE: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: COLS,
  alignItems: 'center', columnGap: '1.25rem',
  padding: '0 1rem', height: '2.75rem',
  borderBottom: '1px solid var(--sapList_BorderColor)',
  background: 'var(--sapList_Background)', cursor: 'default',
}

const HEADER_ROW_STYLE: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: COLS,
  alignItems: 'center', columnGap: '1.25rem',
  padding: '0 1rem', height: '2rem',
  borderBottom: '2px solid var(--sapList_BorderColor)',
  background: 'var(--sapList_HeaderBackground, var(--sapShell_Background))',
  fontSize: '0.75rem', fontWeight: 600,
  color: 'var(--sapContent_LabelColor)',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

// ── FolderPicker ──────────────────────────────────────────────────────────────

function FolderPicker({ excludePath, onSelect, onCancel }: {
  excludePath: string
  onSelect: (path: string) => void
  onCancel: () => void
}) {
  const [browsePath, setBrowsePath] = useState('/')
  const [folders,    setFolders]    = useState<SFTPEntry[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const load = useCallback(async (p: string) => {
    setLoading(true); setError('')
    try {
      const data: SFTPEntry[] = await apiFetch(`/files?path=${encodeURIComponent(p)}`)
      setFolders((data ?? []).filter(e => e.type === 'dir').sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(browsePath) }, [browsePath, load])

  const segments = useMemo(() => {
    if (browsePath === '/') return [{ label: 'Home', path: '/' }]
    const parts = browsePath.slice(1).split('/')
    return [
      { label: 'Home', path: '/' },
      ...parts.map((part, i) => ({ label: part, path: '/' + parts.slice(0, i + 1).join('/') })),
    ]
  }, [browsePath])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap',
        padding: '0.4rem 0.75rem',
        background: 'var(--sapShell_Background)',
        border: '1px solid var(--sapList_BorderColor)',
        borderRadius: '6px', fontSize: '0.8rem',
      }}>
        {segments.map((seg, i) => (
          <span key={seg.path} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {i > 0 && <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.6rem' }}>›</span>}
            {i < segments.length - 1 ? (
              <button onClick={() => setBrowsePath(seg.path)} style={{
                background: 'none', border: 'none', padding: '0.1rem 0.3rem',
                color: 'var(--sapLinkColor)', cursor: 'pointer', fontSize: '0.8rem',
                borderRadius: '3px', fontFamily: 'inherit',
              }}>{seg.label}</button>
            ) : (
              <span style={{ fontWeight: 600, padding: '0 0.2rem' }}>{seg.label}</span>
            )}
          </span>
        ))}
        {loading && <span style={{ color: 'var(--sapContent_LabelColor)', marginLeft: '0.5rem' }}>…</span>}
      </div>
      {error && <span style={{ fontSize: '0.8rem', color: 'var(--sapNegativeColor)' }}>{error}</span>}
      <div style={{
        border: '1px solid var(--sapList_BorderColor)',
        borderRadius: '6px', overflow: 'hidden', maxHeight: '16rem', overflowY: 'auto',
      }}>
        <div onClick={() => onSelect(browsePath)} style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.5rem 0.75rem',
          background: 'color-mix(in srgb, var(--sapHighlightColor) 8%, transparent)',
          borderBottom: '1px solid var(--sapList_BorderColor)',
          cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
          color: 'var(--sapHighlightColor)',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--sapHighlightColor) 16%, transparent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--sapHighlightColor) 8%, transparent)' }}
        >
          <Icon name="accept" style={{ fontSize: '1rem', color: 'var(--sapHighlightColor)' }} />
          Move here — <code style={{ fontFamily: 'monospace', fontWeight: 400, fontSize: '0.8rem' }}>{browsePath}</code>
        </div>
        {folders.length === 0 && !loading && (
          <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center' }}>
            No sub-folders
          </div>
        )}
        {folders.filter(f => f.path !== excludePath && !f.path.startsWith(excludePath + '/')).map(f => (
          <div key={f.path} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--sapList_BorderColor)',
            cursor: 'pointer', fontSize: '0.875rem', background: 'var(--sapList_Background)',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Background)' }}
            onClick={() => setBrowsePath(f.path)}
          >
            <Icon name="folder" style={{ fontSize: '1rem', color: 'var(--sapHighlightColor)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{f.name}</span>
            <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem' }}>›</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SFTPServer() {

  // Config state
  const [config,    setConfig]    = useState<SFTPConfig | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [username,  setUsername]  = useState('')
  const [password,  setPassword]  = useState('')
  const [authMode,  setAuthMode]  = useState('password')
  const [pubKey,    setPubKey]    = useState('')
  const [fpCopied,  setFpCopied]  = useState(false)

  // File browser state
  const [currentPath,     setCurrentPath]     = useState('/')
  const [selectedPath,    setSelectedPath]    = useState<string | null>(null)
  const [items,           setItems]           = useState<SFTPEntry[]>([])
  const [loading,         setLoading]         = useState(false)
  const [dropTarget,      setDropTarget]      = useState<string | null>(null)
  const [isDragging,      setIsDragging]      = useState(false)
  const [moveDialog,      setMoveDialog]      = useState<{ entry: SFTPEntry } | null>(null)
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const [showNewFile,     setShowNewFile]     = useState(false)
  const [showNewFolder,   setShowNewFolder]   = useState(false)
  const [newFileName,     setNewFileName]     = useState('')
  const [newFileContent,  setNewFileContent]  = useState('')
  const [newFolderName,   setNewFolderName]   = useState('')
  const [previewFile,     setPreviewFile]     = useState<SFTPEntry | null>(null)
  const [previewContent,  setPreviewContent]  = useState('')
  const [previewLoading,  setPreviewLoading]  = useState(false)
  const [previewTrunc,    setPreviewTrunc]    = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragItemRef  = useRef<SFTPEntry | null>(null)

  const pathSegments = useMemo(() => {
    if (currentPath === '/') return [{ label: 'Home', path: '/' }]
    const parts = currentPath.slice(1).split('/')
    return [
      { label: 'Home', path: '/' },
      ...parts.map((part, i) => ({ label: part, path: '/' + parts.slice(0, i + 1).join('/') })),
    ]
  }, [currentPath])

  const dirs  = useMemo(() => items.filter(e => e.type === 'dir').sort((a, b) => a.name.localeCompare(b.name)), [items])
  const files = useMemo(() => items.filter(e => e.type === 'file').sort((a, b) => a.name.localeCompare(b.name)), [items])

  // Config load / save
  const loadConfig = useCallback(async () => {
    try {
      const data: SFTPConfig = await apiFetch('')
      setConfig(data)
      setUsername(data.username ?? '')
      setPassword(data.password_set ? '' : 'SFTPPass')
      setAuthMode(data.auth_mode ?? 'password')
      setPubKey(data.authorized_keys ?? '')
    } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const save = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const body: Record<string, unknown> = {
        auth_mode: authMode, username,
        authorized_keys: pubKey,
      }
      if (password) body.password = password
      await apiFetch('/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setSuccess('Configuration saved.')
      setPassword('')
      await loadConfig()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  // File browser
  const loadPath = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const data: SFTPEntry[] = await apiFetch(`/files?path=${encodeURIComponent(path)}`)
      setItems(data ?? [])
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadPath(currentPath) }, [currentPath, loadPath])

  const navigate = (path: string) => {
    setCurrentPath(path); setSelectedPath(null)
    setPreviewFile(null); setPreviewContent('')
    setShowNewFile(false); setShowNewFolder(false)
    setNewFileName(''); setNewFileContent(''); setNewFolderName('')
  }

  const openPreview = async (file: SFTPEntry) => {
    if (previewFile?.path === file.path) { setPreviewFile(null); setPreviewContent(''); return }
    setPreviewFile(file); setPreviewContent(''); setPreviewLoading(true); setPreviewTrunc(false)
    try {
      const data = await apiFetch(`/read?path=${encodeURIComponent(file.path)}`)
      setPreviewContent(data.content)
      setPreviewTrunc(data.truncated)
    } catch (e) { setPreviewContent(`Error: ${(e as Error).message}`) }
    finally { setPreviewLoading(false) }
  }

  const uploadFilesTo = async (fileList: File[], targetPath: string) => {
    const fd = new FormData()
    fileList.forEach(f => fd.append('files', f))
    try {
      const res = await fetch(`${API}/upload?path=${encodeURIComponent(targetPath)}`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      setSuccess(`Uploaded ${fileList.length} file(s) to ${targetPath}`)
      await loadPath(currentPath)
    } catch (e) { setError((e as Error).message) }
  }

  const moveEntry = async (fromPath: string, toFolderPath: string) => {
    const name = fromPath.split('/').pop()!
    const toPath = toFolderPath === '/' ? `/${name}` : `${toFolderPath}/${name}`
    try {
      await apiFetch('/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      })
      await loadPath(currentPath)
    } catch (e) { setError((e as Error).message) }
  }

  const handleBgDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(null); setIsDragging(false)
    if (dragItemRef.current) { dragItemRef.current = null; return }
    const fileList = Array.from(e.dataTransfer.files)
    if (fileList.length) await uploadFilesTo(fileList, currentPath)
  }

  const handleFolderDrop = async (e: React.DragEvent, dir: SFTPEntry) => {
    e.preventDefault(); e.stopPropagation()
    setDropTarget(null); setIsDragging(false)
    const internalPath = e.dataTransfer.getData('text/sftp-path')
    if (internalPath) {
      if (internalPath !== dir.path) await moveEntry(internalPath, dir.path)
      dragItemRef.current = null; return
    }
    const fileList = Array.from(e.dataTransfer.files)
    if (fileList.length) await uploadFilesTo(fileList, dir.path)
  }

  const handleBreadcrumbDrop = async (e: React.DragEvent, destPath: string) => {
    e.preventDefault()
    setDropTarget(null); setIsDragging(false)
    const internalPath = e.dataTransfer.getData('text/sftp-path')
    if (internalPath && internalPath !== destPath) await moveEntry(internalPath, destPath)
    dragItemRef.current = null
  }

  const createFile = async () => {
    if (!newFileName.trim()) return
    try {
      await apiFetch('/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: joinPath(currentPath, newFileName.trim()), content: newFileContent }),
      })
      setShowNewFile(false); setNewFileName(''); setNewFileContent('')
      await loadPath(currentPath)
    } catch (e) { setError((e as Error).message) }
  }

  const createFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await apiFetch('/mkdir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: joinPath(currentPath, newFolderName.trim()) }),
      })
      setShowNewFolder(false); setNewFolderName('')
      await loadPath(currentPath)
    } catch (e) { setError((e as Error).message) }
  }

  const deleteEntry = async (entry: SFTPEntry) => {
    const label = entry.type === 'dir' ? `folder "${entry.name}" and all its contents` : `"${entry.name}"`
    if (!window.confirm(`Delete ${label}?`)) return
    try {
      await apiFetch(`/files?path=${encodeURIComponent(entry.path)}`, { method: 'DELETE' })
      await loadPath(currentPath)
    } catch (e) { setError((e as Error).message) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem', height: '100%', overflow: 'auto', padding: '0.5rem 1rem 1rem' }}>
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
        onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) uploadFilesTo(f, currentPath); e.target.value = '' }} />

      {error   && <MessageStrip design="Negative"  onClose={() => setError('')}>{error}</MessageStrip>}
      {success && <MessageStrip design="Positive"  onClose={() => setSuccess('')}>{success}</MessageStrip>}

      <Toolbar>
        <Label style={{ fontSize: '1.1rem', fontWeight: 600 }}>SFTP Server</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="refresh" onClick={loadConfig} />
        <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
      </Toolbar>

      {/* ── Auth + Host Key ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        <Card header={<CardHeader titleText="Authentication" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '0.75rem 1rem 1rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>Auth Mode</Label>
              <Select style={{ width: '100%' }} onChange={e => setAuthMode((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
                <Option value="password" selected={authMode === 'password'}>Password only</Option>
                <Option value="key"      selected={authMode === 'key'}>Public key only</Option>
                <Option value="any"      selected={authMode === 'any'}>Password or key</Option>
              </Select>
            </FlexBox>
            {(authMode === 'password' || authMode === 'any') && (<>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Username</Label>
                <Input value={username} style={{ width: '100%' }}
                  onInput={e => setUsername((e.target as unknown as InputDomRef).value ?? '')} />
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Password</Label>
                <Input type="Password" value={password}
                  style={{ width: '100%' }}
                  onInput={e => setPassword((e.target as unknown as InputDomRef).value ?? '')} />
              </FlexBox>
            </>)}
            {(authMode === 'key' || authMode === 'any') && (
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Authorized Public Key (authorized_keys format — blank = accept any)</Label>
                <TextArea value={pubKey} rows={4} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={e => setPubKey((e.target as unknown as HTMLTextAreaElement).value)} />
              </FlexBox>
            )}
          </FlexBox>
        </Card>

        <Card header={<CardHeader titleText="SSH Host Key" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '0.75rem 1rem 1rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>Fingerprint</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{
                  background: 'var(--sapField_Background)', border: '1px solid var(--sapField_BorderColor)',
                  borderRadius: '4px', padding: '0.5rem', fontSize: '0.8rem',
                  wordBreak: 'break-all', display: 'block', flex: 1,
                }}>
                  {config?.ssh_host_key_fingerprint || '— not yet synced —'}
                </code>
                {config?.ssh_host_key_fingerprint && (
                  <Button design="Transparent" icon={fpCopied ? 'accept' : 'copy'}
                    onClick={() => {
                      navigator.clipboard.writeText(config.ssh_host_key_fingerprint)
                      setFpCopied(true); setTimeout(() => setFpCopied(false), 1800)
                    }} />
                )}
              </div>
            </FlexBox>
            <code style={{ fontSize: '0.82rem', color: 'var(--sapContent_LabelColor)', background: 'var(--sapNeutralBackground)', padding: '0.4rem 0.6rem', borderRadius: '4px', display: 'block' }}>
              sftp -P 2222 {username || 'user'}@localhost
            </code>
          </FlexBox>
        </Card>
      </div>

      {/* ── File System ──────────────────────────────────────────────────── */}
      <Card>
        {/* Path bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0 1rem', height: '2.25rem',
          borderBottom: '1px solid var(--sapList_BorderColor)',
          background: 'var(--sapField_Background)',
        }}>
          <Icon name="navigation-right-arrow" style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }} />
          <span style={{
            fontFamily: 'monospace', fontSize: '0.8rem',
            color: selectedPath ? 'var(--sapTextColor)' : 'var(--sapContent_LabelColor)',
            letterSpacing: '0.01em', userSelect: 'all', flex: 1,
          }}>
            {selectedPath ?? currentPath}
          </span>
        </div>

        {/* Breadcrumb + actions */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.25rem',
          padding: '0 1rem', height: '3rem',
          borderBottom: '1px solid var(--sapList_BorderColor)',
          background: 'var(--sapShell_Background)',
        }}>
          {pathSegments.map((seg, i) => {
            const isAncestor = i < pathSegments.length - 1
            const isBcTarget = isDragging && isAncestor && dropTarget === seg.path
            return (
              <span key={seg.path} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {i > 0 && <Icon name="slim-arrow-right" style={{ fontSize: '0.625rem', color: 'var(--sapContent_LabelColor)' }} />}
                {isAncestor ? (
                  <button onClick={() => navigate(seg.path)}
                    onDragOver={isDragging ? e => { e.preventDefault(); setDropTarget(seg.path) } : undefined}
                    onDragLeave={isDragging ? () => setDropTarget(null) : undefined}
                    onDrop={isDragging ? e => handleBreadcrumbDrop(e, seg.path) : undefined}
                    style={{
                      background: isBcTarget ? 'var(--sapList_SelectionBackgroundColor)' : 'none',
                      border: isBcTarget ? '1px solid var(--sapHighlightColor)' : '1px solid transparent',
                      padding: '0.2rem 0.4rem',
                      color: 'var(--sapLinkColor)', cursor: isDragging ? 'copy' : 'pointer',
                      fontSize: '0.875rem', borderRadius: '4px', fontFamily: 'inherit',
                      transition: 'background 0.1s',
                    }}>
                    {seg.label}
                  </button>
                ) : (
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, padding: '0 0.25rem' }}>{seg.label}</span>
                )}
              </span>
            )
          })}
          {loading && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>loading…</span>}
          <div style={{ flex: 1 }} />
          <Button icon="add"         onClick={() => { setShowNewFile(v => !v); setShowNewFolder(false) }}>New File</Button>
          <Button icon="folder"      onClick={() => { setShowNewFolder(v => !v); setShowNewFile(false) }} style={{ marginLeft: '0.5rem' }}>New Folder</Button>
          <Button icon="upload"      onClick={() => fileInputRef.current?.click()} style={{ marginLeft: '0.5rem' }}>Upload</Button>
          <Button icon="open-folder" onClick={() => setShowAssetPicker(true)} style={{ marginLeft: '0.5rem' }}>Load Asset</Button>
          <Button design="Transparent" icon="refresh" onClick={() => loadPath(currentPath)} style={{ marginLeft: '0.25rem' }} />
        </div>

        {/* New Folder form */}
        {showNewFolder && (
          <div style={{
            padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)',
            background: 'var(--sapField_Background)', display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <Icon name="folder" style={{ color: 'var(--sapHighlightColor)' }} />
            <Input placeholder="Folder name" value={newFolderName}
              onInput={e => setNewFolderName((e.target as unknown as InputDomRef).value ?? '')}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') createFolder()
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
              }}
              style={{ flex: 1 }} />
            <Button design="Emphasized" onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
            <Button onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>Cancel</Button>
          </div>
        )}

        {/* New File form */}
        {showNewFile && (
          <div style={{
            padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)',
            background: 'var(--sapField_Background)', display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Icon name="document" />
              <Input placeholder="filename.xml" value={newFileName}
                onInput={e => setNewFileName((e.target as unknown as InputDomRef).value ?? '')}
                style={{ flex: 1 }} />
            </div>
            <TextArea placeholder="File content (optional)" value={newFileContent}
              onInput={e => setNewFileContent((e.target as unknown as HTMLTextAreaElement).value)}
              rows={4} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button design="Emphasized" onClick={createFile} disabled={!newFileName.trim()}>Create File</Button>
              <Button onClick={() => { setShowNewFile(false); setNewFileName(''); setNewFileContent('') }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* File list */}
        <div
          onDragOver={e => { e.preventDefault(); if (dropTarget !== 'bg') setDropTarget('bg') }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null) }}
          onDrop={handleBgDrop}
          style={{ position: 'relative', minHeight: '12rem' }}
        >
          {dropTarget === 'bg' && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'color-mix(in srgb, var(--sapHighlightColor) 10%, transparent)',
              border: '2px dashed var(--sapHighlightColor)', borderRadius: '0 0 8px 8px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              pointerEvents: 'none',
            }}>
              <Icon name="upload" style={{ fontSize: '2rem', color: 'var(--sapHighlightColor)' }} />
              <span style={{ fontWeight: 600, color: 'var(--sapHighlightColor)' }}>Drop to upload into {currentPath}</span>
            </div>
          )}

          {(dirs.length > 0 || files.length > 0) && (
            <div style={HEADER_ROW_STYLE}>
              <span>Name</span>
              <span style={{ textAlign: 'right' }}>Size</span>
              <span style={{ textAlign: 'right' }}>Modified</span>
              <span />
            </div>
          )}

          {dirs.map(dir => {
            const isDroppingHere = dropTarget === dir.path
            return (
              <div key={dir.path} draggable
                onDragStart={e => { dragItemRef.current = dir; e.dataTransfer.setData('text/sftp-path', dir.path); e.dataTransfer.effectAllowed = 'move'; setIsDragging(true) }}
                onDragEnd={() => { dragItemRef.current = null; setDropTarget(null); setIsDragging(false) }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget(dir.path) }}
                onDragLeave={e => { e.stopPropagation(); setDropTarget(t => t === dir.path ? 'bg' : t) }}
                onDrop={e => handleFolderDrop(e, dir)}
                onClick={() => { setSelectedPath(dir.path); navigate(dir.path) }}
                style={{
                  ...ROW_STYLE, cursor: 'pointer',
                  background: isDroppingHere ? 'var(--sapList_SelectionBackgroundColor)' : 'var(--sapList_Background)',
                  outline: isDroppingHere ? '2px solid var(--sapHighlightColor)' : 'none', outlineOffset: '-2px',
                }}
                onMouseEnter={e => { if (!isDroppingHere) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
                onMouseLeave={e => { if (!isDroppingHere) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Background)' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <Icon name="folder" style={{ color: 'var(--sapHighlightColor)', fontSize: '1rem', flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir.name}</span>
                </span>
                <span /><span />
                <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.25rem' }}>
                  <ActionBtn title="Move to…" color="var(--sapHighlightColor)" onClick={e => { e.stopPropagation(); setMoveDialog({ entry: dir }) }}>→</ActionBtn>
                  <ActionBtn title="Delete folder" color="var(--sapNegativeColor)" onClick={e => { e.stopPropagation(); deleteEntry(dir) }}>✕</ActionBtn>
                </span>
              </div>
            )
          })}

          {files.map(file => (
            <div key={file.path} draggable
              onDragStart={e => { dragItemRef.current = file; e.dataTransfer.setData('text/sftp-path', file.path); e.dataTransfer.effectAllowed = 'move'; setIsDragging(true) }}
              onDragEnd={() => { dragItemRef.current = null; setDropTarget(null); setIsDragging(false) }}
              onClick={() => { setSelectedPath(file.path); openPreview(file) }}
              style={{
                ...ROW_STYLE, cursor: 'pointer',
                background: selectedPath === file.path ? 'var(--sapList_SelectionBackgroundColor)' : 'var(--sapList_Background)',
                outline: selectedPath === file.path ? '2px solid var(--sapHighlightColor)' : 'none', outlineOffset: '-2px',
              }}
              onMouseEnter={e => { if (selectedPath !== file.path) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
              onMouseLeave={e => { if (selectedPath !== file.path) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Background)' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <Icon name="document" style={{ fontSize: '1rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
              </span>
              <span style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>{formatSize(file.size)}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', textAlign: 'right' }}>{formatDate(file.mod_time)}</span>
              <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.25rem' }}>
                <ActionBtn title="Move to…" color="var(--sapHighlightColor)" onClick={e => { e.stopPropagation(); setMoveDialog({ entry: file }) }}>→</ActionBtn>
                <ActionBtn title="Delete file" color="var(--sapNegativeColor)" onClick={e => { e.stopPropagation(); deleteEntry(file) }}>✕</ActionBtn>
              </span>
            </div>
          ))}

          {!loading && dirs.length === 0 && files.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem', gap: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
              <Icon name="folder" style={{ fontSize: '3rem', opacity: 0.3 }} />
              <span style={{ fontSize: '1rem', fontWeight: 500 }}>This folder is empty</span>
              <span style={{ fontSize: '0.875rem', textAlign: 'center' }}>
                Drag and drop files here, or use <strong>Upload</strong>, <strong>New File</strong>, or <strong>New Folder</strong> above
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Load Asset — V2 AssetBrowser */}
      <AssetBrowser open={showAssetPicker} onClose={() => setShowAssetPicker(false)}
        title={`Load Asset into ${currentPath}`}
        onSelect={async (content, meta) => {
          setShowAssetPicker(false)
          try {
            await apiFetch('/files', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: joinPath(currentPath, meta.name), content }),
            })
            setSuccess(`Asset "${meta.name}" loaded into ${currentPath}`)
            await loadPath(currentPath)
          } catch (e) { setError((e as Error).message) }
        }} />

      {/* File preview modal */}
      {previewFile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setPreviewFile(null); setPreviewContent('') } }}>
          <div style={{ background: 'var(--sapBackgroundColor)', border: '1px solid var(--sapList_BorderColor)', borderRadius: '8px', width: '56rem', maxWidth: '90vw', display: 'flex', flexDirection: 'column', boxShadow: 'var(--sapContent_Shadow3)', maxHeight: '80vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapShell_Background)', borderRadius: '8px 8px 0 0' }}>
              <Icon name="document" style={{ fontSize: '1rem', color: 'var(--sapHighlightColor)', flexShrink: 0 }} />
              <code style={{ fontFamily: 'monospace', fontSize: '0.85rem', flex: 1, wordBreak: 'break-all' }}>{previewFile.path}</code>
              {previewTrunc && <span style={{ fontSize: '0.75rem', color: 'var(--sapCriticalTextColor)', flexShrink: 0 }}>truncated at 256 KB</span>}
              <button onClick={() => { setPreviewFile(null); setPreviewContent('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '1.1rem', lineHeight: 1, color: 'var(--sapContent_LabelColor)', borderRadius: '4px', fontFamily: 'inherit' }}>✕</button>
            </div>
            <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
              {previewLoading ? (
                <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>Loading…</span>
              ) : (
                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--sapTextColor)' }}>
                  {previewContent || <span style={{ color: 'var(--sapContent_LabelColor)' }}>(empty file)</span>}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Move to… modal */}
      {moveDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setMoveDialog(null) }}>
          <div style={{ background: 'var(--sapBackgroundColor)', border: '1px solid var(--sapList_BorderColor)', borderRadius: '8px', padding: '1.5rem', width: '32rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: 'var(--sapContent_Shadow3)' }}>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>Move "{moveDialog.entry.name}"</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
              From: <code style={{ fontFamily: 'monospace' }}>{moveDialog.entry.path}</code>
            </div>
            <FolderPicker excludePath={moveDialog.entry.path}
              onSelect={async dest => { await moveEntry(moveDialog.entry.path, dest); setMoveDialog(null) }}
              onCancel={() => setMoveDialog(null)} />
          </div>
        </div>
      )}
    </FlexBox>
  )
}

// ── Small helper ──────────────────────────────────────────────────────────────

function ActionBtn({ title, color, onClick, children }: {
  title: string; color: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
      color, fontSize: '0.875rem', lineHeight: 1, borderRadius: '4px',
      opacity: 0.55, fontFamily: 'inherit',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.55' }}
    >{children}</button>
  )
}
