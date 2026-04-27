import { useState, useEffect, useCallback } from 'react'
import { Button, FlexBox, FlexBoxAlignItems, FlexBoxJustifyContent, Input, Label, MessageStrip, Option, Select } from '@ui5/webcomponents-react'
import { useWorkspace } from '../../context/WorkspaceContext'

interface Tile {
  id: string
  project_id: string
  instance_id: string
  name: string
  time_range: string
  status: string
  package_id: string
  iflow_id: string
}

const TIME_RANGES = ['Past Hour', 'Past 4 Hours', 'Past Day', 'Past Week']
const STATUSES    = ['', 'COMPLETED', 'FAILED', 'RETRY', 'PROCESSING', 'ESCALATED']
const STATUS_LABELS: Record<string, string> = {
  '': 'All', COMPLETED: 'Completed', FAILED: 'Failed',
  RETRY: 'Retry', PROCESSING: 'Processing', ESCALATED: 'Escalated',
}
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#107e3e', FAILED: '#bb0000', RETRY: '#e9730c',
  PROCESSING: '#0064d9', ESCALATED: '#6a2194',
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v2${path}`, opts)
  const data = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText)
  return data
}

export default function Dashboard() {
  const { selectedInstance, selectedProject } = useWorkspace()
  const [tiles,      setTiles]      = useState<Tile[]>([])
  const [counts,     setCounts]     = useState<Record<string, number | null>>({})
  const [showAdd,    setShowAdd]    = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newTime,    setNewTime]    = useState('Past Hour')
  const [newStatus,  setNewStatus]  = useState('')
  const [newPkgId,   setNewPkgId]   = useState('')
  const [newFlowId,  setNewFlowId]  = useState('')
  const [adding,     setAdding]     = useState(false)
  const [error,      setError]      = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const loadTiles = useCallback(async (iid: string) => {
    try {
      const data = await apiFetch<Tile[]>(`/monitoring/${iid}/tiles`)
      setTiles(data ?? [])
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => {
    if (selectedInstance) loadTiles(selectedInstance.id)
    else setTiles([])
  }, [selectedInstance, loadTiles])

  useEffect(() => {
    if (!selectedInstance || tiles.length === 0) return
    setCounts({})
    tiles.forEach(async tile => {
      try {
        const data = await apiFetch<{ count: number }>(`/monitoring/${selectedInstance.id}/tiles/${tile.id}/count`)
        setCounts(prev => ({ ...prev, [tile.id]: data.count }))
      } catch {
        setCounts(prev => ({ ...prev, [tile.id]: null }))
      }
    })
  }, [tiles, selectedInstance, refreshKey])

  async function addTile() {
    if (!newName.trim() || !selectedInstance || !selectedProject) return
    setAdding(true); setError('')
    try {
      const tile = await apiFetch<Tile>(`/monitoring/${selectedInstance.id}/tiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: selectedProject.id, name: newName.trim(), time_range: newTime, status: newStatus, package_id: newPkgId, iflow_id: newFlowId }),
      })
      setTiles(prev => [...prev, tile])
      setShowAdd(false); setNewName(''); setNewTime('Past Hour'); setNewStatus(''); setNewPkgId(''); setNewFlowId('')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setAdding(false) }
  }

  async function deleteTile(id: string) {
    if (!selectedInstance) return
    await apiFetch(`/monitoring/${selectedInstance.id}/tiles/${id}`, { method: 'DELETE' }).catch(() => {})
    setTiles(prev => prev.filter(t => t.id !== id))
    setCounts(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  if (!selectedInstance) {
    return (
      <div style={{ padding: '2rem' }}>
        <MessageStrip design="Critical" hideCloseButton>
          No instance selected. Choose a project and instance from the context bar.
        </MessageStrip>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' }}>
          Monitor Message Processing — {selectedInstance.name}
        </span>
        <Button icon="refresh" design="Transparent" onClick={() => setRefreshKey(k => k + 1)}>Refresh</Button>
      </FlexBox>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
        {tiles.map(tile => (
          <TileCard
            key={tile.id}
            tile={tile}
            count={counts[tile.id]}
            onDelete={() => deleteTile(tile.id)}
          />
        ))}

        {!showAdd ? (
          <div
            onClick={() => setShowAdd(true)}
            style={{
              width: '180px', height: '160px', borderRadius: '12px', cursor: 'pointer',
              border: '2px dashed var(--sapList_BorderColor)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--sapContent_LabelColor)', fontSize: '2rem',
              background: 'var(--sapBackgroundColor)',
            }}
          >+</div>
        ) : (
          <div style={{ width: '320px', padding: '1rem', borderRadius: '12px', border: '1px solid var(--sapList_BorderColor)', background: 'var(--sapList_Background)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label>Tile Name</Label>
            <Input value={newName} placeholder="e.g. Failed Messages" style={{ width: '100%' }}
              onInput={e => setNewName((e.target as unknown as HTMLInputElement).value)} />
            <Label>Time Range</Label>
            <Select style={{ width: '100%' }} onChange={e => setNewTime((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
              {TIME_RANGES.map(t => <Option key={t} value={t} selected={newTime === t}>{t}</Option>)}
            </Select>
            <Label>Status</Label>
            <Select style={{ width: '100%' }} onChange={e => setNewStatus((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
              {STATUSES.map(s => <Option key={s} value={s} selected={newStatus === s}>{STATUS_LABELS[s]}</Option>)}
            </Select>
            <Label>Package ID <span style={{ fontWeight: 400, color: 'var(--sapContent_LabelColor)' }}>(optional)</span></Label>
            <Input value={newPkgId} placeholder="e.g. MyPackage" disabled={!!newFlowId}
              style={{ width: '100%', opacity: newFlowId ? 0.4 : 1 }}
              onInput={e => { setNewPkgId((e.target as unknown as HTMLInputElement).value); setNewFlowId('') }} />
            <Label>iFlow ID <span style={{ fontWeight: 400, color: 'var(--sapContent_LabelColor)' }}>(optional, overrides Package)</span></Label>
            <Input value={newFlowId} placeholder="e.g. OrdersProcessing" disabled={!!newPkgId}
              style={{ width: '100%', opacity: newPkgId ? 0.4 : 1 }}
              onInput={e => { setNewFlowId((e.target as unknown as HTMLInputElement).value); setNewPkgId('') }} />
            {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
            <FlexBox style={{ gap: '0.5rem', marginTop: '0.25rem' }}>
              <Button design="Emphasized" onClick={addTile} disabled={adding}>{adding ? 'Saving…' : 'Add'}</Button>
              <Button design="Transparent" onClick={() => { setShowAdd(false); setError('') }}>Cancel</Button>
            </FlexBox>
          </div>
        )}
      </div>
    </div>
  )
}

function TileCard({ tile, count, onDelete }: { tile: Tile; count: number | null | undefined; onDelete: () => void }) {
  const color = tile.status ? STATUS_COLORS[tile.status] ?? 'var(--sapContent_LabelColor)' : 'var(--sapContent_LabelColor)'
  return (
    <div style={{
      width: '180px', height: '160px', borderRadius: '12px', cursor: 'default',
      border: '1px solid var(--sapList_BorderColor)', background: 'var(--sapList_Background)',
      padding: '1rem', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)', position: 'relative',
    }}>
      <button onClick={onDelete} style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem', opacity: 0.5, padding: '0.2rem' }}>✕</button>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)', lineHeight: 1.3 }}>{tile.name}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginTop: '0.15rem' }}>{tile.time_range}</div>
      </div>
      <div style={{ textAlign: 'center', fontSize: '2.8rem', fontWeight: 300, color, lineHeight: 1 }}>
        {count === undefined ? '…' : count === null ? '!' : count.toLocaleString()}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
        {tile.status ? STATUS_LABELS[tile.status] + ' Messages' : 'Messages'}
      </div>
    </div>
  )
}
