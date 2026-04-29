import { useState, useEffect, useCallback } from 'react'
import {
  Button, Input, MessageStrip, BusyIndicator, Dialog, Bar,
  Select, Option, Label,
} from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import { useWorkspace, useClipboard, clipboardName } from '../context/WorkspaceContext'
import type { AssetMeta } from '../components/AssetBrowser'
import SaveAssetDialog from '../components/SaveAssetDialog'

// ── helpers ───────────────────────────────────────────────────────────────────

const TYPE_FILTERS = ['all', 'xml', 'json', 'groovy', 'xsd', 'xslt', 'request', 'payload', 'snippet', 'cert', 'other']

const TYPE_COLOURS: Record<string, { bg: string; text: string }> = {
  xml:     { bg: '#e8f4fd', text: '#0070f2' },
  json:    { bg: '#fff3e0', text: '#e65100' },
  script:  { bg: '#f3e5f5', text: '#7b1fa2' },
  request: { bg: '#e8f5e9', text: '#2e7d32' },
  payload: { bg: '#fce4ec', text: '#c62828' },
  snippet: { bg: '#e3f2fd', text: '#1565c0' },
  cert:    { bg: '#fafafa', text: '#424242' },
  other:   { bg: '#fafafa', text: '#424242' },
}

function typeStyle(t: string) {
  return TYPE_COLOURS[t] ?? TYPE_COLOURS.other
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

// ── AssetRow ──────────────────────────────────────────────────────────────────

function AssetRow({ asset, onClipboard, onDelete, clipping, deleting }: {
  asset: AssetMeta
  onClipboard: () => void
  onDelete: () => void
  clipping: boolean
  deleting: boolean
}) {
  const tc = typeStyle(asset.type)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.5rem 1rem',
      borderBottom: '1px solid var(--sapList_BorderColor)',
      background: 'var(--sapList_Background)',
    }}>
      <span style={{
        fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
        background: tc.bg, color: tc.text,
        borderRadius: '3px', padding: '0.15rem 0.45rem',
        fontFamily: 'var(--sapFontFamily)', minWidth: '3.5rem', textAlign: 'center',
      }}>
        {asset.type || '—'}
      </span>

      <span style={{
        flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem',
        color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {asset.name}
      </span>

      {asset.project_name && (
        <span style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {asset.project_name}{asset.sub_project_name ? ` / ${asset.sub_project_name}` : ''}
        </span>
      )}

      <span style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', whiteSpace: 'nowrap', flexShrink: 0, minWidth: '4.5rem', textAlign: 'right' }}>
        {relTime(asset.updated_at)}
      </span>

      <div style={{ display: 'flex', gap: '0.1rem', flexShrink: 0 }}>
        <Button design="Transparent" icon={clipping ? 'accept' : 'copy'}
          title="Copy to clipboard" onClick={onClipboard}
          style={{ height: '1.75rem', padding: '0 0.4rem' }} />
        <Button design="Transparent" icon="delete"
          title="Delete" onClick={onDelete} disabled={deleting}
          style={{ height: '1.75rem', padding: '0 0.4rem', color: 'var(--sapNegativeColor)' }} />
      </div>
    </div>
  )
}

// ── ConfirmDeleteDialog ───────────────────────────────────────────────────────

function ConfirmDeleteDialog({ name, onConfirm, onCancel }: {
  name: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <Dialog open headerText="Delete Asset" style={{ width: '360px' }} onClose={onCancel}>
      <div style={{ padding: '1rem', fontFamily: 'var(--sapFontFamily)', fontSize: '0.85rem', color: 'var(--sapTextColor)' }}>
        Delete <strong>{name}</strong>? This cannot be undone.
      </div>
      <Bar slot="footer">
        <Button slot="endContent" design="Negative" onClick={onConfirm}>Delete</Button>
        <Button slot="endContent" design="Transparent" onClick={onCancel}>Cancel</Button>
      </Bar>
    </Dialog>
  )
}

// ── AssetLibrary ──────────────────────────────────────────────────────────────

export default function AssetLibrary() {
  const { projects } = useWorkspace()
  const { pushClipboard } = useClipboard()

  const [assets,        setAssets]        = useState<AssetMeta[]>([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [search,        setSearch]        = useState('')
  const [typeFilter,    setTypeFilter]    = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [clippedId,     setClippedId]     = useState<string | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<AssetMeta | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [newOpen,       setNewOpen]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/v2/assets')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAssets(await res.json() as AssetMeta[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleClipboard(asset: AssetMeta) {
    try {
      const res = await fetch(`/api/v2/assets/${asset.id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const detail = await res.json() as AssetMeta & { content: string }
      pushClipboard({ name: clipboardName(asset.name), content: detail.content, source: 'Asset Library' })
      setClippedId(asset.id)
      setTimeout(() => setClippedId(null), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load asset content')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(deleteTarget.id)
    try {
      await fetch(`/api/v2/assets/${deleteTarget.id}`, { method: 'DELETE' })
      setAssets(prev => prev.filter(a => a.id !== deleteTarget.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
      setDeleteTarget(null)
    }
  }

  const visible = assets.filter(a => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false
    if (projectFilter !== 'all' && a.project_id !== projectFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return a.name.toLowerCase().includes(q) ||
             a.type.toLowerCase().includes(q) ||
             (a.project_name ?? '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap',
        padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
      }}>
        <Input value={search} placeholder="Search by name, type or project…"
          style={{ width: '240px' }}
          onInput={e => setSearch((e.target as unknown as InputDomRef).value ?? '')} />

        <Label style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
          Type
        </Label>
        <Select style={{ width: '110px' }}
          onChange={e => setTypeFilter((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
          {TYPE_FILTERS.map(t => <Option key={t} value={t} selected={t === typeFilter}>{t}</Option>)}
        </Select>

        {projects.length > 0 && (
          <>
            <Label style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
              Project
            </Label>
            <Select style={{ width: '160px' }}
              onChange={e => setProjectFilter((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
              <Option value="all" selected={projectFilter === 'all'}>All projects</Option>
              {projects.map(p => <Option key={p.id} value={p.id} selected={projectFilter === p.id}>{p.name}</Option>)}
            </Select>
          </>
        )}

        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>
          {visible.length} of {assets.length}
        </span>
        <Button design="Transparent" icon="refresh" onClick={load} />
        <Button design="Emphasized" icon="add" onClick={() => setNewOpen(true)}>New asset</Button>
      </div>

      {error && (
        <div style={{ padding: '0.5rem 1rem', flexShrink: 0 }}>
          <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>
        </div>
      )}

      {/* List header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.3rem 1rem',
        borderBottom: '2px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', minWidth: '3.5rem' }}>Type</span>
        <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>Name</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }}>Project</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', minWidth: '4.5rem', textAlign: 'right' }}>Updated</span>
        <span style={{ minWidth: '4rem' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '3rem' }}>
            <BusyIndicator active />
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            textAlign: 'center', paddingTop: '3rem',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.9rem',
            color: 'var(--sapContent_LabelColor)', fontStyle: 'italic',
          }}>
            {assets.length === 0
              ? 'No assets yet — save content from any tool to build your library'
              : 'No assets match the current filters'}
          </div>
        ) : (
          visible.map(asset => (
            <AssetRow key={asset.id} asset={asset}
              onClipboard={() => handleClipboard(asset)}
              onDelete={() => setDeleteTarget(asset)}
              clipping={clippedId === asset.id}
              deleting={deleting === asset.id}
            />
          ))
        )}
      </div>

      <SaveAssetDialog open={newOpen} content="" defaultType="snippet" allowEditContent
        onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); load() }} />

      {deleteTarget && (
        <ConfirmDeleteDialog name={deleteTarget.name}
          onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  )
}
