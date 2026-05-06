import { useEffect, useRef, useState } from 'react'
import type { System } from './types'
import { STATUSES, STATUS_COLORS } from './types'
import type { DiagramFilter } from './useRegistryApi'

interface Props {
  systems:  System[]
  filter:   DiagramFilter
  onChange: (f: DiagramFilter) => void
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
  const count    = selected.length
  const active   = count > 0

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

export default function ArchitectureFilters({ systems, filter, onChange }: Props) {
  const activeCount = (filter.systemIds.length ? 1 : 0) +
    (filter.infraTypes.length ? 1 : 0) + (filter.statuses.length ? 1 : 0) +
    (filter.functionalDomain.length ? 1 : 0)

  const systemOptions = systems.map(s => ({ value: s.id, label: s.name }))
  const statusOptions = STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1), color: STATUS_COLORS[s] }))

  // Derive infra options from actual system data, not the static config list
  const infraOptions = [...new Set(systems.map(s => s.infra_type).filter(Boolean))]
    .sort()
    .map(t => ({ value: t, label: t }))

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
      padding: '6px 10px', borderBottom: '1px solid var(--sapList_BorderColor)',
      background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
    }}>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600, marginRight: 2 }}>
        Filter
      </span>

      <MultiSelect label="System"   options={systemOptions} selected={filter.systemIds}        onChange={v => onChange({ ...filter, systemIds: v })}        searchable />
      <MultiSelect label="Infra"    options={infraOptions}  selected={filter.infraTypes}       onChange={v => onChange({ ...filter, infraTypes: v })}       />
      <MultiSelect label="Status"   options={statusOptions} selected={filter.statuses}         onChange={v => onChange({ ...filter, statuses: v })}         />

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {activeCount > 0 && (
          <>
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
              {activeCount} active
            </span>
            <button
              onClick={() => onChange({ ...filter, systemIds: [], infraTypes: [], statuses: [], functionalDomain: [] })}
              style={{ padding: '3px 8px', cursor: 'pointer', border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', background: 'transparent', fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapTextColor)' }}
            >Clear</button>
          </>
        )}
        <button
          onClick={() => onChange({ ...filter, strict: !filter.strict })}
          title={filter.strict ? 'Strict: all endpoints must be within the filtered pool' : 'Loose: show interfaces where sender is in pool, pulling in derived systems'}
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
      </div>
    </div>
  )
}
