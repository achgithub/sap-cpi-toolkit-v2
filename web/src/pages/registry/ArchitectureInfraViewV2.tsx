import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { System, RegistryConfig } from './types'
import { getSystemColor } from './types'
import type { ManagedByConfig } from './useRegistryApiV2'

interface Props {
  systems:        System[]
  config:         RegistryConfig
  managedByTypes: ManagedByConfig[]
}

const SYS_W       = 160
const SYS_H       = 80
const SYS_GAP     = 16
const GROUP_PAD   = 20
const GROUP_HDR   = 36   // height of the infra label bar at top of each group box
const GROUP_GAP   = 32
const COLS        = 3    // max systems per row within a group
const WRAP_AT     = 1400 // canvas x at which groups wrap to next row

interface SysLayout  { system: System; x: number; y: number }
interface GroupLayout {
  infra: string
  x: number; y: number
  w: number; h: number
  items: SysLayout[]
}

function buildLayout(groups: [string, System[]][]): GroupLayout[] {
  const result: GroupLayout[] = []
  let gx = 0, gy = 0, rowH = 0

  for (const [infra, systems] of groups) {
    const cols    = Math.min(systems.length, COLS)
    const rows    = Math.ceil(systems.length / COLS)
    const innerW  = cols  * SYS_W + (cols  - 1) * SYS_GAP
    const innerH  = rows  * SYS_H + (rows  - 1) * SYS_GAP
    const gw      = innerW + GROUP_PAD * 2
    const gh      = innerH + GROUP_PAD * 2 + GROUP_HDR

    if (gx > 0 && gx + gw > WRAP_AT) {
      gx  = 0
      gy += rowH + GROUP_GAP
      rowH = 0
    }

    const items: SysLayout[] = systems.map((s, i) => ({
      system: s,
      x: gx + GROUP_PAD + (i % COLS) * (SYS_W + SYS_GAP),
      y: gy + GROUP_HDR + GROUP_PAD + Math.floor(i / COLS) * (SYS_H + SYS_GAP),
    }))

    result.push({ infra, x: gx, y: gy, w: gw, h: gh, items })
    rowH = Math.max(rowH, gh)
    gx  += gw + GROUP_GAP
  }

  return result
}

function loadOverrides(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem('infra_group_colors') ?? '{}') } catch { return {} }
}
function saveOverrides(c: Record<string, string>) {
  localStorage.setItem('infra_group_colors', JSON.stringify(c))
}

const PALETTE = ['#1565C0', '#2E7D32', '#6A1B9A', '#E65100', '#00695C', '#AD1457', '#37474F', '#F57F17']

const toolBtn: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)',
  borderRadius: '4px', background: 'var(--sapTile_Background)',
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
  color: 'var(--sapTextColor)', cursor: 'pointer',
}

export default function ArchitectureInfraViewV2({ systems, config, managedByTypes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan,   setPan]   = useState({ x: 40, y: 40 })
  const [scale, setScale] = useState(1)
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(() => loadOverrides())
  const [colorPickInfra, setColorPickInfra] = useState<string | null>(null)
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  // Group by managed_by, falling back to infra_type if not set
  const grouped: [string, System[]][] = Object.entries(
    systems.reduce<Record<string, System[]>>((acc, s) => {
      const key = s.managed_by || s.infra_type || 'Unclassified'
      ;(acc[key] ??= []).push(s)
      return acc
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b))

  const layout = buildLayout(grouped)

  const fitView = useCallback(() => {
    const el = containerRef.current
    if (!el || layout.length === 0) return
    const minX = Math.min(...layout.map(g => g.x))
    const minY = Math.min(...layout.map(g => g.y))
    const maxX = Math.max(...layout.map(g => g.x + g.w))
    const maxY = Math.max(...layout.map(g => g.y + g.h))
    const pad  = 60
    const sc   = Math.min((el.clientWidth - pad * 2) / (maxX - minX), (el.clientHeight - pad * 2) / (maxY - minY), 1.5)
    setScale(sc)
    setPan({ x: pad - minX * sc, y: pad - minY * sc })
  }, [layout])

  useEffect(() => { fitView() }, [systems]) // eslint-disable-line react-hooks/exhaustive-deps

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setScale(s => {
      const ns = Math.min(Math.max(s * factor, 0.15), 3)
      setPan(p => ({ x: mx - (mx - p.x) * (ns / s), y: my - (my - p.y) * (ns / s) }))
      return ns
    })
  }, [])

  const onBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setColorPickInfra(null)
    panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panRef.current) return
    setPan({ x: panRef.current.px + e.clientX - panRef.current.mx, y: panRef.current.py + e.clientY - panRef.current.my })
  }, [])

  const onMouseUp = useCallback(() => { panRef.current = null }, [])

  function groupColor(name: string) {
    // Local override takes priority, then config color, then default grey
    return colorOverrides[name]
      ?? managedByTypes.find(m => m.name === name)?.color
      ?? '#78909C'
  }

  return (
    <div ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: 'var(--sapBackgroundColor)' }}
      onMouseDown={onBgMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}
    >
      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20, display: 'flex', gap: '6px' }}
        onMouseDown={e => e.stopPropagation()}>
        <button style={toolBtn} onClick={fitView}>⤢ Fit</button>
      </div>

      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>

          {layout.map(group => {
            const gc = groupColor(group.infra)
            return (
              <g key={group.infra}>
                {/* Group rectangle */}
                <rect x={group.x} y={group.y} width={group.w} height={group.h}
                  rx={10} fill="var(--sapTile_Background)" stroke={gc} strokeWidth={2} opacity={0.95} />
                {/* Header bar */}
                <rect x={group.x} y={group.y} width={group.w} height={GROUP_HDR}
                  rx={10} fill={gc} />
                <rect x={group.x} y={group.y + GROUP_HDR - 10} width={group.w} height={10} fill={gc} />
                {/* Infra label */}
                <text x={group.x + group.w / 2} y={group.y + GROUP_HDR / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={13} fontWeight="bold" fill="#fff" fontFamily="var(--sapFontFamily)"
                  style={{ userSelect: 'none', cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); setColorPickInfra(group.infra) }}>
                  {group.infra}
                </text>

                {/* System boxes */}
                {group.items.map(({ system: s, x, y }) => {
                  const sc2  = getSystemColor(s.system_type, config)
                  const lc   = s.lifecycle_status || 'active'
                  const lcColor = lc === 'retiring' ? '#F59E0B' : lc === 'decommissioned' ? '#9E9E9E' : lc === 'planned' ? '#6B7280' : sc2
                  return (
                    <g key={s.id} transform={`translate(${x},${y})`} opacity={lc === 'decommissioned' ? 0.45 : 1}>
                      <rect width={SYS_W} height={SYS_H} rx={6}
                        fill="var(--sapTile_Background)" stroke={lc !== 'active' ? lcColor : sc2} strokeWidth={lc === 'retiring' ? 2 : 1.5} />
                      <rect width={SYS_W} height={5} rx={6} fill={lc !== 'active' ? lcColor : sc2} />
                      <rect width={SYS_W} height={2.5} y={2.5} fill={lc !== 'active' ? lcColor : sc2} />
                      {/* System name */}
                      <text x={SYS_W / 2} y={20}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={11} fontWeight="bold" fill="var(--sapTextColor)" fontFamily="var(--sapFontFamily)"
                        style={{ userSelect: 'none' }}>
                        {s.name.length > 20 ? s.name.slice(0, 19) + '…' : s.name}
                      </text>
                      {/* System type */}
                      {s.system_type && (
                        <text x={SYS_W / 2} y={34}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={9} fill={sc2} fontFamily="var(--sapFontFamily)"
                          style={{ userSelect: 'none' }}>
                          {s.system_type}
                        </text>
                      )}
                      {/* Deployment type badge */}
                      {s.deployment_type && (
                        <g>
                          <rect x={4} y={SYS_H - 22} width={SYS_W - 8} height={14} rx={7}
                            fill={sc2} opacity={0.15} />
                          <text x={SYS_W / 2} y={SYS_H - 15}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={8} fill={sc2} fontFamily="var(--sapFontFamily)"
                            style={{ userSelect: 'none' }}>
                            {s.deployment_type}{s.infra_region ? ` · ${s.infra_region}` : ''}
                          </text>
                        </g>
                      )}
                      {/* Business owner */}
                      {s.owner && (
                        <text x={SYS_W / 2} y={SYS_H - 5}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={7} fill="var(--sapContent_LabelColor)" fontFamily="var(--sapFontFamily)"
                          style={{ userSelect: 'none' }}>
                          {s.owner}
                        </text>
                      )}
                      {/* Lifecycle badge for non-active */}
                      {lc !== 'active' && (
                        <text x={SYS_W - 4} y={10}
                          textAnchor="end" dominantBaseline="middle"
                          fontSize={7} fontWeight="bold" fill={lcColor} fontFamily="var(--sapFontFamily)"
                          style={{ userSelect: 'none' }}>
                          {lc === 'retiring' ? '⚠' : lc === 'planned' ? '◷' : '✕'}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Group colour picker */}
      {colorPickInfra && (
        <div style={{
          position: 'absolute', top: 50, left: 8, zIndex: 100,
          background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', gap: 6,
        }} onMouseDown={e => e.stopPropagation()}>
          <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)' }}>
            Colour for {colorPickInfra}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {PALETTE.map(c => (
              <div key={c}
                style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: colorOverrides[colorPickInfra] === c ? '2px solid var(--sapTextColor)' : '2px solid transparent' }}
                onClick={() => {
                  const next = { ...colorOverrides, [colorPickInfra]: c }
                  setColorOverrides(next); saveOverrides(next); setColorPickInfra(null)
                }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
