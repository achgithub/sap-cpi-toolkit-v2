import { useEffect, useRef, useState, useCallback } from 'react'
import type { System, Point } from './types'
import type { DiagramFilter } from './types'
import { LIFECYCLE_STATUSES, emptyFilter } from './types'
import type { StatusConfig } from './types_v2'

interface Props {
  systems:          System[]
  filter:           DiagramFilter
  onChange:         (f: DiagramFilter) => void
  statusConfigs:    StatusConfig[]
  viewMode:         'interface' | 'infra'
  onViewModeChange: (m: 'interface' | 'infra') => void
  posRef:           React.MutableRefObject<Record<string, Point>>
  onLoadView:       (filter: DiagramFilter, positions: Record<string, Point>) => void
}

function MultiSelect({
  label, options, selected, onChange, searchable,
}: {
  label: string
  options: { value: string; label: string; color?: string }[]
  selected: string[]
  onChange: (v: string[]) => void
  searchable?: boolean
}) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = query ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options
  const count = selected.length
  const active = count > 0

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '3px 10px', cursor: 'pointer',
          border: `1px solid ${active ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'}`,
          borderRadius: '14px',
          background: active ? 'var(--sapHighlightColor)' : 'var(--sapTile_Background)',
          color: active ? '#fff' : 'var(--sapTextColor)',
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
          display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
        }}
      >
        {label}{count > 0 ? ` (${count})` : ''} <span style={{ fontSize: '0.6rem' }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 300,
          background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          minWidth: '180px', maxHeight: '260px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {searchable && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
              <input
                autoFocus
                placeholder="Search…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px',
                  padding: '3px 6px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
                  background: 'var(--sapBackgroundColor)', color: 'var(--sapTextColor)',
                }}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {selected.length > 0 && (
              <button
                onClick={() => onChange([])}
                style={{
                  width: '100%', padding: '5px 10px', border: 'none', cursor: 'pointer',
                  background: 'transparent', textAlign: 'left',
                  fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem',
                  color: 'var(--sapHighlightColor)', borderBottom: '1px solid var(--sapList_BorderColor)',
                }}
              >Clear selection</button>
            )}
            {filtered.map(opt => (
              <label key={opt.value} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '5px 10px', cursor: 'pointer',
                borderBottom: '1px solid var(--sapList_BorderColor)',
                background: selected.includes(opt.value) ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
              }}>
                <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} style={{ margin: 0 }} />
                {opt.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />}
                <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem', color: 'var(--sapTextColor)' }}>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const BASE_V2 = '/api/interfaces/v2'

interface ArchView {
  id: string; name: string; owner: string
  filter: DiagramFilter
  positions: Record<string, Point>
  is_default: boolean
}

export default function ArchitectureFiltersV2({ systems, filter, onChange, statusConfigs, viewMode, onViewModeChange, posRef, onLoadView }: Props) {
  const lsFilter    = filter.lifecycleStatuses ?? []
  const activeCount = (filter.systemIds.length ? 1 : 0) +
    (filter.infraTypes.length ? 1 : 0) + (filter.statuses.length ? 1 : 0) +
    (lsFilter.length ? 1 : 0)

  const [views,         setViews]        = useState<ArchView[]>([])
  const [saving,        setSaving]       = useState(false)
  const [viewName,      setViewName]     = useState('')
  const [viewOwner,     setViewOwner]    = useState('')
  const nameInputRef    = useRef<HTMLInputElement>(null)
  const defaultApplied  = useRef(false)

  useEffect(() => {
    fetch(`${BASE_V2}/architecture-views`)
      .then(r => r.json())
      .then((data: ArchView[]) => {
        setViews(data)
        if (!defaultApplied.current) {
          defaultApplied.current = true
          const def = data.find(v => v.is_default)
          if (def) onLoadView({ ...emptyFilter(), ...def.filter }, def.positions ?? {})
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDefault = useCallback(async (view: ArchView) => {
    if (view.is_default) {
      await fetch(`${BASE_V2}/architecture-views/clear-default`, { method: 'POST' })
      setViews(prev => prev.map(v => ({ ...v, is_default: false })))
    } else {
      await fetch(`${BASE_V2}/architecture-views/${view.id}/set-default`, { method: 'POST' })
      setViews(prev => prev.map(v => ({ ...v, is_default: v.id === view.id })))
    }
  }, [])

  useEffect(() => { if (saving) nameInputRef.current?.focus() }, [saving])

  async function confirmSave() {
    const name = viewName.trim()
    if (!name) return
    const res = await fetch(`${BASE_V2}/architecture-views`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, owner: viewOwner.trim(), filter, positions: posRef.current }),
    })
    if (res.ok) {
      const saved: ArchView = await res.json()
      setViews(prev => {
        const without = prev.filter(v => v.id !== saved.id && v.name !== saved.name)
        return [...without, saved].sort((a, b) => a.name.localeCompare(b.name))
      })
    }
    setViewName(''); setViewOwner(''); setSaving(false)
  }

  async function deleteView(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) return
    await fetch(`${BASE_V2}/architecture-views/${id}`, { method: 'DELETE' })
    setViews(prev => prev.filter(v => v.id !== id))
  }

  const [viewsOpen, setViewsOpen] = useState(false)
  const viewsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!viewsOpen) return
    function onDoc(e: MouseEvent) {
      if (viewsRef.current && !viewsRef.current.contains(e.target as Node)) setViewsOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [viewsOpen])

  const systemOptions = systems.map(s => ({ value: s.id, label: s.name }))
  const statusOptions = statusConfigs.map(s => ({
    value: s.name,
    label: s.name.charAt(0).toUpperCase() + s.name.slice(1),
    color: s.color,
  }))
  const infraOptions = [...new Set(systems.map(s => s.infra_type).filter(Boolean))]
    .sort()
    .map(t => ({ value: t, label: t }))

  const base: React.CSSProperties = {
    padding: '3px 8px', cursor: 'pointer', border: '1px solid var(--sapList_BorderColor)',
    borderRadius: '4px', background: 'transparent',
    fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapTextColor)',
  }

  const modeBtn = (mode: 'interface' | 'infra'): React.CSSProperties => ({
    padding: '2px 10px', cursor: 'pointer', fontSize: '0.72rem',
    fontFamily: 'var(--sapFontFamily)', borderRadius: '14px',
    border: `1px solid ${viewMode === mode ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'}`,
    background: viewMode === mode ? 'var(--sapHighlightColor)' : 'transparent',
    color: viewMode === mode ? '#fff' : 'var(--sapTextColor)',
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
      padding: '6px 10px', borderBottom: '1px solid var(--sapList_BorderColor)',
      background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
    }}>
      {/* View mode toggle */}
      <button style={modeBtn('interface')} onClick={() => onViewModeChange('interface')}>Interface</button>
      <button style={modeBtn('infra')}     onClick={() => onViewModeChange('infra')}>Infra</button>

      {/* Divider */}
      <span style={{ width: 1, height: 16, background: 'var(--sapList_BorderColor)', margin: '0 2px' }} />

      {/* Filters — only in interface mode */}
      {viewMode === 'interface' && (<>
        <MultiSelect label="System"    options={systemOptions}    selected={filter.systemIds}         onChange={v => onChange({ ...filter, systemIds: v })}          searchable />
        <MultiSelect label="Infra"     options={infraOptions}     selected={filter.infraTypes}        onChange={v => onChange({ ...filter, infraTypes: v })} />
        <MultiSelect label="Status"    options={statusOptions}    selected={filter.statuses}          onChange={v => onChange({ ...filter, statuses: v })} />
        <MultiSelect label="Lifecycle" options={LIFECYCLE_STATUSES.map(l => ({ value: l.value, label: l.label, color: l.color }))} selected={lsFilter} onChange={v => onChange({ ...filter, lifecycleStatuses: v })} />
      </>)}

      {viewMode === 'interface' && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {activeCount > 0 && (
          <>
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
              {activeCount} active
            </span>
            <button onClick={() => onChange({ ...filter, systemIds: [], infraTypes: [], statuses: [], functionalDomain: [], lifecycleStatuses: [] })} style={base}>
              Clear
            </button>
          </>
        )}

        <button
          onClick={() => onChange({ ...filter, strict: !filter.strict })}
          title={filter.strict ? 'Strict: both endpoints must be in the filtered pool' : 'Loose: show all interfaces where at least one endpoint is in the pool'}
          style={{
            padding: '3px 10px', cursor: 'pointer',
            border: `1px solid ${filter.strict ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'}`,
            borderRadius: '14px',
            background: filter.strict ? 'var(--sapHighlightColor)' : 'var(--sapTile_Background)',
            color: filter.strict ? '#fff' : 'var(--sapTextColor)',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', whiteSpace: 'nowrap',
          }}
        >
          Strict
        </button>

        {/* ── Saved views dropdown ────────────────────────────────────── */}
        {views.length > 0 && !saving && (
          <div ref={viewsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setViewsOpen(o => !o)}
              style={{
                ...base, cursor: 'pointer',
                border: `1px solid ${views.some(v => v.is_default) ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'}`,
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              {views.some(v => v.is_default) ? '★ ' : ''}Views ({views.length}) <span style={{ fontSize: '0.6rem' }}>▾</span>
            </button>
            {viewsOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300,
                background: 'var(--sapTile_Background)',
                border: '1px solid var(--sapList_BorderColor)',
                borderRadius: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                minWidth: '220px', overflow: 'hidden',
              }}>
                {views.map(v => (
                  <div key={v.id} style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '5px 8px', borderBottom: '1px solid var(--sapList_BorderColor)',
                  }}>
                    {/* Load */}
                    <button
                      onClick={() => { onLoadView({ ...emptyFilter(), ...v.filter }, v.positions ?? {}); setViewsOpen(false) }}
                      style={{
                        flex: 1, textAlign: 'left', border: 'none', background: 'transparent',
                        cursor: 'pointer', fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem',
                        color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        padding: '2px 4px',
                      }}
                      title={v.owner ? `Owner: ${v.owner}` : undefined}
                    >
                      {v.name}{v.owner ? <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.72rem' }}> — {v.owner}</span> : null}
                    </button>
                    {/* Default star */}
                    <button
                      onClick={() => toggleDefault(v)}
                      title={v.is_default ? 'Remove as default' : 'Set as default (auto-loads when Architecture opens)'}
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        fontSize: '0.9rem', padding: '2px 4px', flexShrink: 0,
                        color: v.is_default ? '#F59E0B' : 'var(--sapContent_LabelColor)',
                        lineHeight: 1,
                      }}
                    >
                      {v.is_default ? '★' : '☆'}
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => deleteView(v.id, v.name)}
                      title="Delete view"
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        fontSize: '0.78rem', padding: '2px 4px', flexShrink: 0,
                        color: 'var(--sapNegativeColor)', lineHeight: 1,
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {saving ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <input
              ref={nameInputRef}
              value={viewName}
              onChange={e => setViewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setSaving(false); setViewName(''); setViewOwner('') } }}
              placeholder="View name…"
              style={{
                fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem',
                border: `1px solid ${views.some(v => v.name === viewName.trim()) ? 'var(--sapWarningColor)' : 'var(--sapHighlightColor)'}`,
                borderRadius: '4px', padding: '2px 6px', width: 130,
                background: 'var(--sapField_Background)', color: 'var(--sapTextColor)',
              }}
            />
            {/* Filter summary — warn if saving with no filters active */}
            {activeCount === 0 ? (
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem', color: 'var(--sapWarningColor)', whiteSpace: 'nowrap' }}>
                No filters set — will save as "show all"
              </span>
            ) : (
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem', color: 'var(--sapPositiveColor)', whiteSpace: 'nowrap' }}>
                {activeCount} filter{activeCount > 1 ? 's' : ''} will be saved
              </span>
            )}
            {views.some(v => v.name === viewName.trim()) && (
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem', color: 'var(--sapWarningColor)', whiteSpace: 'nowrap' }}>
                · will overwrite existing
              </span>
            )}
            <button onClick={confirmSave} disabled={!viewName.trim()}
              style={{ ...base, borderColor: 'var(--sapHighlightColor)', color: 'var(--sapHighlightColor)' }}>
              {views.some(v => v.name === viewName.trim()) ? 'Overwrite' : 'Save'}
            </button>
            <button onClick={() => { setSaving(false); setViewName(''); setViewOwner('') }} style={base}>✕</button>
          </div>
        ) : (
          <button onClick={() => setSaving(true)} style={base} title="Save current filter selection as a named view">
            + Save view
          </button>
        )}

      </div>}
    </div>
  )
}
