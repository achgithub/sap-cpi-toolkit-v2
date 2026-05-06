import { useEffect, useRef, useState } from 'react'
import type { IFSystem, RegistryConfig } from './types'
import { STATUSES, STATUS_COLORS } from './types'

export interface DiagramFilter {
  systems:    string[]   // specific system IDs
  statuses:   string[]   // interface status
  infraTypes: string[]   // system.infra_type values (e.g. On-Prem, AWS)
  strict:     boolean    // when true, ALL receivers must be in pool (default)
}

export const emptyFilter = (): DiagramFilter =>
  ({ systems: [], statuses: [], infraTypes: [], strict: true })

export function activeFilterCount(f: DiagramFilter) {
  return (f.systems.length ? 1 : 0) + (f.statuses.length ? 1 : 0) +
         (f.infraTypes.length ? 1 : 0)
}

interface Props {
  systems: IFSystem[]
  config: RegistryConfig
  filter: DiagramFilter
  onChange: (f: DiagramFilter) => void
}

// ── Generic multi-select dropdown ─────────────────────────────────────────────

interface DropdownProps {
  label: string
  options: { value: string; label: string; color?: string }[]
  selected: string[]
  onChange: (v: string[]) => void
  searchable?: boolean
}

function MultiDropdown({ label, options, selected, onChange, searchable }: DropdownProps) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  }

  const count = selected.length
  const active = count > 0

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
              >
                Clear selection
              </button>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: '8px 10px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
                No matches
              </div>
            )}
            {filtered.map(opt => (
              <label
                key={opt.value}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '5px 10px', cursor: 'pointer',
                  borderBottom: '1px solid var(--sapList_BorderColor)',
                  background: selected.includes(opt.value) ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  style={{ margin: 0, cursor: 'pointer' }}
                />
                {opt.color && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                )}
                <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem', color: 'var(--sapTextColor)' }}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

export default function DiagramFilters({ systems, config, filter, onChange }: Props) {
  const count = activeFilterCount(filter)

  const systemOptions = systems.map(s => ({ value: s.id, label: s.name }))

  const statusOptions = STATUSES.map(s => ({
    value: s, label: s.charAt(0).toUpperCase() + s.slice(1),
    color: STATUS_COLORS[s],
  }))

  // Infra type options — deduplicated from the config list
  const infraOptions = config.infraTypes.map(t => ({ value: t.name, label: t.name }))

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
      padding: '6px 10px',
      borderBottom: '1px solid var(--sapList_BorderColor)',
      background: 'var(--sapGroup_TitleBackground)',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem',
        color: 'var(--sapContent_LabelColor)', fontWeight: 600, marginRight: 2,
      }}>
        Filter
      </span>

      <MultiDropdown
        label="System"
        options={systemOptions}
        selected={filter.systems}
        onChange={v => onChange({ ...filter, systems: v })}
        searchable
      />
      <MultiDropdown
        label="Status"
        options={statusOptions}
        selected={filter.statuses}
        onChange={v => onChange({ ...filter, statuses: v })}
      />
      <MultiDropdown
        label="Infra"
        options={infraOptions}
        selected={filter.infraTypes}
        onChange={v => onChange({ ...filter, infraTypes: v })}
      />

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {count > 0 && (
          <>
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
              {count} active
            </span>
            <button
              onClick={() => onChange({ ...emptyFilter(), strict: filter.strict })}
              style={{
                padding: '3px 8px', cursor: 'pointer',
                border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px',
                background: 'transparent', fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem',
                color: 'var(--sapTextColor)',
              }}
            >
              Clear all
            </button>
          </>
        )}
        <button
          onClick={() => onChange({ ...filter, strict: !filter.strict })}
          title={filter.strict
            ? 'Strict: all receivers must be within the pool. Click to allow derived systems.'
            : 'Loose: interfaces that touch the pool are shown, pulling in derived systems. Click for strict.'}
          style={{
            padding: '3px 10px', cursor: 'pointer',
            border: `1px solid ${filter.strict ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'}`,
            borderRadius: '14px',
            background: filter.strict ? 'var(--sapHighlightColor)' : 'var(--sapTile_Background)',
            color: filter.strict ? '#fff' : 'var(--sapTextColor)',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
            whiteSpace: 'nowrap',
          }}
        >
          Strict
        </button>
      </div>
    </div>
  )
}
