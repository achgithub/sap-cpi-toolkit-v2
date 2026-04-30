import { useState, useEffect } from 'react'
import {
  Dialog, Bar, Button, Input, BusyIndicator, MessageStrip,
} from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import { useWorkspace } from '../context/WorkspaceContext'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssetMeta {
  id: string
  name: string
  type: string
  meta: Record<string, unknown>
  project_id: string | null
  project_name: string | null
  sub_project_id: string | null
  sub_project_name: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (content: string, meta: AssetMeta) => void
  filterType?: string
  title?: string
}

const TYPE_FILTERS = ['all', 'xml', 'json', 'script', 'request', 'payload', 'snippet', 'cert']

function TypeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <span onClick={onClick} style={{
      display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '0.75rem',
      fontSize: '0.72rem', cursor: 'pointer', userSelect: 'none',
      fontWeight: active ? 600 : 400,
      fontFamily: 'var(--sapFontFamily)',
      background: active ? 'var(--sapHighlightColor)' : 'var(--sapButton_Lite_Background)',
      color: active ? '#fff' : 'var(--sapTextColor)',
      border: '1px solid ' + (active ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'),
      transition: 'all 0.1s',
    }}>
      {label}
    </span>
  )
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssetBrowser({ open, onClose, onSelect, filterType, title = 'Load Asset' }: Props) {
  const { selectedProject } = useWorkspace()

  const [assets,       setAssets]       = useState<AssetMeta[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [search,       setSearch]       = useState('')
  const [typeFilter,   setTypeFilter]   = useState(filterType ?? 'all')
  const [projectOnly,  setProjectOnly]  = useState(false)
  const [loadingId,    setLoadingId]    = useState<string | null>(null)
  const [deleteId,     setDeleteId]     = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setTypeFilter(filterType ?? 'all')
    setError('')
    fetchAssets()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAssets() {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (projectOnly && selectedProject) params.set('project_id', selectedProject.id)
      const res = await fetch(`/api/v2/assets?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAssets(await res.json() as AssetMeta[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(asset: AssetMeta) {
    setLoadingId(asset.id)
    try {
      const res = await fetch(`/api/v2/assets/${asset.id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const detail = await res.json() as AssetMeta & { content: string }
      onSelect(detail.content, asset)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load asset')
    } finally {
      setLoadingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeleteId(id)
    try {
      const res = await fetch(`/api/v2/assets/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
      setAssets(prev => prev.filter(a => a.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleteId(null)
    }
  }

  const visible = assets.filter(a => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false
    if (projectOnly && selectedProject && a.project_id !== selectedProject.id && a.project_id !== null) return false
    if (search) {
      const q = search.toLowerCase()
      return a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <Dialog
      open={open}
      headerText={title}
      style={{ width: '72vw', height: '80vh' }}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', height: '100%', boxSizing: 'border-box' }}>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Input
              value={search}
              placeholder="Search by name or type…"
              style={{ flex: 1 }}
              onInput={e => setSearch((e.target as unknown as InputDomRef).value ?? '')}
            />
            {selectedProject && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer',
                fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={projectOnly}
                  onChange={e => { setProjectOnly(e.target.checked); setTimeout(fetchAssets, 0) }} />
                {selectedProject.name} only
              </label>
            )}
            <Button design="Transparent" icon="refresh" onClick={fetchAssets} />
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {TYPE_FILTERS.map(t => (
              <TypeChip key={t} label={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} />
            ))}
          </div>
        </div>

        {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <BusyIndicator active />
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--sapFontFamily)',
              fontSize: '0.85rem', color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>
              {assets.length === 0 ? 'No assets saved yet' : 'No assets match the current filter'}
            </div>
          ) : (
            visible.map(asset => (
              <div key={asset.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.625rem 1rem',
                borderBottom: '1px solid var(--sapList_BorderColor)',
                cursor: loadingId ? 'default' : 'pointer',
                transition: 'background 0.12s',
              }}
                onMouseEnter={e => { if (!loadingId) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                onClick={() => { if (!loadingId) handleSelect(asset) }}
              >
                {/* Type badge */}
                {asset.type && (
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, flexShrink: 0,
                    background: 'var(--sapNeutralBackground)',
                    border: '1px solid var(--sapList_BorderColor)',
                    borderRadius: '3px', padding: '0.1rem 0.35rem',
                    fontFamily: 'var(--sapFontFamily)', color: 'var(--sapContent_LabelColor)',
                    minWidth: '2.5rem', textAlign: 'center',
                  }}>
                    {asset.type}
                  </span>
                )}

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.85rem', fontWeight: 600,
                    color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.name}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.1rem', flexWrap: 'wrap' }}>
                    {asset.project_name && (
                      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
                        {asset.project_name}{asset.sub_project_name ? ` / ${asset.sub_project_name}` : ''}
                      </span>
                    )}
                    <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
                      {relTime(asset.updated_at)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {loadingId === asset.id ? (
                  <BusyIndicator active style={{ fontSize: '0.8rem' }} />
                ) : (
                  <Button
                    design="Transparent"
                    icon={deleteId === asset.id ? 'accept' : 'delete'}
                    onClick={e => { e.stopPropagation(); handleDelete(asset.id) }}
                    style={{ flexShrink: 0 }}
                  />
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>
          {visible.length} asset{visible.length !== 1 ? 's' : ''}{assets.length !== visible.length ? ` (${assets.length} total)` : ''}
        </div>
      </div>

      <Bar slot="footer">
        <Button slot="endContent" design="Transparent" onClick={onClose}>Cancel</Button>
      </Bar>
    </Dialog>
  )
}
