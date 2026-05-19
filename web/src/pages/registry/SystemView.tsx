import { useEffect, useMemo, useState } from 'react'
import { Button, Input } from '@ui5/webcomponents-react'
import { useRegistryApi } from './useRegistryApi'
import { getSystemColor } from './types'

export default function SystemView() {
  const api = useRegistryApi()
  const [search,     setSearch]     = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ifaceCounts = useMemo(() => {
    const counts: Record<string, { sends: number; receives: number }> = {}
    api.interfaces.forEach(i => {
      if (i.sender_system_id) {
        counts[i.sender_system_id] ??= { sends: 0, receives: 0 }
        counts[i.sender_system_id].sends++
      }
      i.receivers.forEach(r => {
        if (r.system_id) {
          counts[r.system_id] ??= { sends: 0, receives: 0 }
          counts[r.system_id].receives++
        }
      })
    })
    return counts
  }, [api.interfaces])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return api.systems
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.system_type.toLowerCase().includes(q) || s.infra_type.toLowerCase().includes(q))
      .sort((a, b) => {
        const ta = (ifaceCounts[a.id]?.sends ?? 0) + (ifaceCounts[a.id]?.receives ?? 0)
        const tb = (ifaceCounts[b.id]?.sends ?? 0) + (ifaceCounts[b.id]?.receives ?? 0)
        return tb - ta || a.name.localeCompare(b.name)
      })
  }, [api.systems, ifaceCounts, search])

  const selected = selectedId ? api.systems.find(s => s.id === selectedId) ?? null : null

  const col: React.CSSProperties = { fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)' }
  const cell: React.CSSProperties = { fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const grid = '2fr 140px 150px 55px 55px 55px'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* List */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0 }}>
          <Input
            placeholder="Search systems…"
            value={search}
            showClearIcon
            style={{ width: '220px' }}
            onInput={e => setSearch((e.target as unknown as HTMLInputElement).value)}
          />
          <span style={{ marginLeft: 'auto', ...col }}>{filtered.length} of {api.systems.length} systems</span>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '0 12px', padding: '6px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
          {['System', 'Type', 'Infrastructure', 'Sends', 'Rcvs', 'Total'].map(h => (
            <span key={h} style={col}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {api.loading && (
            <div style={{ padding: '2rem', textAlign: 'center', ...col }}>Loading…</div>
          )}
          {!api.loading && filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', ...col }}>
              {api.systems.length === 0 ? 'No systems registered.' : 'No systems match the search.'}
            </div>
          )}
          {filtered.map(s => {
            const counts = ifaceCounts[s.id] ?? { sends: 0, receives: 0 }
            const total  = counts.sends + counts.receives
            const color  = getSystemColor(s.system_type, api.config)
            const infra  = [s.infra_type, s.infra_region].filter(Boolean).join(' · ')
            const isSel  = selectedId === s.id
            return (
              <div
                key={s.id}
                onClick={() => setSelectedId(p => p === s.id ? null : s.id)}
                style={{
                  display: 'grid', gridTemplateColumns: grid, gap: '0 12px',
                  padding: '8px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--sapList_BorderColor)',
                  background: isSel ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
                  alignItems: 'center',
                }}
              >
                {/* Name + accent dot */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ ...cell, fontWeight: 600 }}>{s.name}</div>
                    {s.description && <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</div>}
                  </div>
                </div>
                <span style={{ ...cell, color }}>{s.system_type || '—'}</span>
                <span style={cell}>{infra || '—'}</span>
                <span style={{ ...cell, textAlign: 'center' }}>{counts.sends  || '—'}</span>
                <span style={{ ...cell, textAlign: 'center' }}>{counts.receives || '—'}</span>
                <span style={{ ...cell, textAlign: 'center', fontWeight: total > 0 ? 600 : 'normal' }}>{total || '—'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel — read-only */}
      {selected && (() => {
        const counts = ifaceCounts[selected.id] ?? { sends: 0, receives: 0 }
        const color  = getSystemColor(selected.system_type, api.config)
        const sends  = api.interfaces.filter(i => i.sender_system_id === selected.id)
        const recvs  = api.interfaces.filter(i => i.receivers.some(r => r.system_id === selected.id))
        return (
          <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_ContentBackground)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>{selected.name}</span>
              </div>
              <Button design="Transparent" icon="decline" onClick={() => setSelectedId(null)} />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Metadata */}
              {[
                ['Type',        selected.system_type],
                ['Infra',       [selected.infra_type, selected.infra_region].filter(Boolean).join(' · ')],
                ['Owner',       selected.owner_type],
                ['Managed By',  selected.managed_by],
                ['Deployment',  selected.deployment_type],
                ['Biz Owner',   selected.owner],
                ...(selected.description ? [['Description', selected.description]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 8, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: 80, flexShrink: 0 }}>{label}</span>
                  <span style={{ color: 'var(--sapTextColor)' }}>{value || '—'}</span>
                </div>
              ))}

              {/* Interface counts summary */}
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {[['Sends', counts.sends], ['Receives', counts.receives], ['Total', counts.sends + counts.receives]].map(([label, n]) => (
                  <div key={label} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)', borderRadius: 6 }}>
                    <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '1.1rem', fontWeight: 'bold', color }}>{n as number || '0'}</div>
                    <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Interface lists */}
              {sends.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', marginBottom: 4 }}>Sends ({sends.length})</div>
                  {sends.map(i => (
                    <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--sapList_BorderColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>
                      <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>{i.ref}</code>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--sapTextColor)' }}>{i.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {recvs.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', marginBottom: 4 }}>Receives ({recvs.length})</div>
                  {recvs.map(i => (
                    <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--sapList_BorderColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem' }}>
                      <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>{i.ref}</code>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--sapTextColor)' }}>{i.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {sends.length === 0 && recvs.length === 0 && (
                <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', marginTop: 8 }}>No interfaces registered for this system.</div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
