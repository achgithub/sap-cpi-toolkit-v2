import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dagre from '@dagrejs/dagre'
import type { IFSystem, IFInterface, RegistryConfig } from './types'
import { STATUS_COLORS, getSystemColor } from './types'

interface Props {
  systems: IFSystem[]
  interfaces: IFInterface[]
  config: RegistryConfig
  selectedIfaceId: string | null
  onSelectIface: (id: string | null) => void
  onNodeMoved: (id: string, x: number, y: number) => void
}

const NODE_W = 160
const NODE_H = 100
const SNAP   = 20

// Closest point on a rectangle's border in the direction of another point
function borderPoint(cx: number, cy: number, tx: number, ty: number, w: number, h: number) {
  const dx = tx - cx, dy = ty - cy
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy }
  const sx = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity
  const s  = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

function snap(v: number) { return Math.round(v / SNAP) * SNAP }

// Initial Dagre layout for systems that have no saved positions
function dagreLayout(systems: IFSystem[], pairs: [string, string][]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 220, nodesep: 80, marginx: 60, marginy: 60 })
  systems.forEach(s => g.setNode(s.id, { width: NODE_W, height: NODE_H }))
  pairs.forEach(([a, b]) => { if (g.hasNode(a) && g.hasNode(b)) g.setEdge(a, b) })
  dagre.layout(g)
  const pos: Record<string, { x: number; y: number }> = {}
  systems.forEach(s => {
    const n = g.node(s.id)
    pos[s.id] = n ? { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 } : { x: 60, y: 60 }
  })
  return pos
}

export default function DiagramCanvas({ systems, interfaces, config, selectedIfaceId, onSelectIface, onNodeMoved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan,   setPan]   = useState({ x: 40, y: 40 })
  const [scale, setScale] = useState(1)
  const [pos,   setPos]   = useState<Record<string, { x: number; y: number }>>({})
  const [popup, setPopup] = useState<{ sx: number; sy: number; ifaceIds: string[] } | null>(null)
  const [clickedKey, setClickedKey] = useState<string | null>(null)

  // Drag state stored in a ref to avoid stale closure issues in global listeners
  const drag = useRef<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  // Build connection pairs (undirected, deduped)
  const pairs = useMemo(() => {
    const map = new Map<string, string[]>()
    interfaces.forEach(iface => {
      if (!iface.sender_system_id) return
      iface.receivers.forEach(rec => {
        if (!rec.system_id || rec.system_id === iface.sender_system_id) return
        const key = [iface.sender_system_id!, rec.system_id].sort().join('__')
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(iface.id)
      })
    })
    return map
  }, [interfaces])

  // Initialise positions from saved DB values or Dagre
  useEffect(() => {
    const pairList: [string, string][] = Array.from(pairs.keys()).map(k => k.split('__') as [string, string])
    const layout = dagreLayout(systems, pairList)
    setPos(prev => {
      const next = { ...prev }
      systems.forEach(s => {
        if (!next[s.id]) {
          next[s.id] = (s.pos_x !== 0 || s.pos_y !== 0)
            ? { x: s.pos_x, y: s.pos_y }
            : layout[s.id] ?? { x: 60, y: 60 }
        }
      })
      // Remove positions for deleted systems
      Object.keys(next).forEach(id => { if (!systems.find(s => s.id === id)) delete next[id] })
      return next
    })
  }, [systems, pairs])

  const ifaceIndex = useMemo(() => {
    const m = new Map<string, IFInterface>()
    interfaces.forEach(i => m.set(i.id, i))
    return m
  }, [interfaces])

  // ── Global mouse handlers ─────────────────────────────────────────────────

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (drag.current) {
        const dx = (e.clientX - drag.current.mx) / scale
        const dy = (e.clientY - drag.current.my) / scale
        setPos(prev => ({
          ...prev,
          [drag.current!.id]: { x: drag.current!.ox + dx, y: drag.current!.oy + dy },
        }))
      }
      if (panRef.current) {
        const dx = e.clientX - panRef.current.mx
        const dy = e.clientY - panRef.current.my
        setPan({ x: panRef.current.px + dx, y: panRef.current.py + dy })
      }
    }
    function onUp(e: MouseEvent) {
      if (drag.current) {
        const id = drag.current.id
        const dx = (e.clientX - drag.current.mx) / scale
        const dy = (e.clientY - drag.current.my) / scale
        const nx = snap(drag.current.ox + dx)
        const ny = snap(drag.current.oy + dy)
        setPos(prev => ({ ...prev, [id]: { x: nx, y: ny } }))
        onNodeMoved(id, nx, ny)
        drag.current = null
      }
      panRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [scale, onNodeMoved])

  // Wheel zoom centred on cursor
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect  = el!.getBoundingClientRect()
      const mx    = e.clientX - rect.left
      const my    = e.clientY - rect.top
      const delta = e.deltaY < 0 ? 1.1 : 0.9
      setScale(s => {
        const ns = Math.max(0.2, Math.min(3, s * delta))
        setPan(p => ({ x: mx - (mx - p.x) * (ns / s), y: my - (my - p.y) * (ns / s) }))
        return ns
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onBoxMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setPopup(null); setClickedKey(null)
    const p = pos[id] ?? { x: 0, y: 0 }
    drag.current = { id, ox: p.x, oy: p.y, mx: e.clientX, my: e.clientY }
  }, [pos])

  const onBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setPopup(null); setClickedKey(null)
    panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onLineClick = useCallback((e: React.MouseEvent, key: string, ifaceIds: string[]) => {
    e.stopPropagation()
    if (clickedKey === key) { setClickedKey(null); setPopup(null); return }
    setClickedKey(key)
    setPopup({ sx: e.clientX, sy: e.clientY, ifaceIds })
    if (ifaceIds.length === 1) onSelectIface(ifaceIds[0])
  }, [clickedKey, onSelectIface])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      onMouseDown={onBgMouseDown}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--sapBackgroundColor)', cursor: 'grab' }}
    >
      {/* Transform wrapper — everything inside shares the same coordinate space */}
      <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})` }}>

        {/* SVG for lines — pointer-events only on the hit areas */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          {Array.from(pairs.entries()).map(([key, ifaceIds]) => {
            const [aid, bid] = key.split('__')
            const pa = pos[aid], pb = pos[bid]
            if (!pa || !pb) return null
            const acx = pa.x + NODE_W / 2, acy = pa.y + NODE_H / 2
            const bcx = pb.x + NODE_W / 2, bcy = pb.y + NODE_H / 2
            const src = borderPoint(acx, acy, bcx, bcy, NODE_W, NODE_H)
            const tgt = borderPoint(bcx, bcy, acx, acy, NODE_W, NODE_H)
            const highlighted = key === clickedKey
            const stroke = highlighted ? 'var(--sapHighlightColor)' : '#555'
            const count  = ifaceIds.length
            const mx = (src.x + tgt.x) / 2, my = (src.y + tgt.y) / 2
            return (
              <g key={key}>
                {/* Wide transparent hit area */}
                <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke="transparent" strokeWidth={16}
                  style={{ cursor: 'pointer' }}
                  onClick={e => onLineClick(e as unknown as React.MouseEvent, key, ifaceIds)}
                />
                {/* Visible line */}
                <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={stroke} strokeWidth={highlighted ? 2.5 : 1.5}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Count badge */}
                {count > 1 && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={mx - 10} y={my - 9} width={20} height={18} rx={4}
                      fill="var(--sapTile_Background)" stroke={stroke} strokeWidth={1} />
                    <text x={mx} y={my + 5} textAnchor="middle"
                      fontSize={11} fontFamily="var(--sapFontFamily)" fill="var(--sapContent_LabelColor)" fontWeight={600}>
                      {count}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>

        {/* System nodes */}
        {systems.map(s => {
          const p     = pos[s.id]
          if (!p) return null
          const color     = getSystemColor(s.system_type, config)
          const infraLine = [s.infra_type, s.infra_region].filter(Boolean).join(' · ')
          return (
            <div
              key={s.id}
              onMouseDown={e => onBoxMouseDown(e, s.id)}
              style={{
                position: 'absolute', left: p.x, top: p.y,
                width: NODE_W, height: NODE_H,
                boxSizing: 'border-box', cursor: 'grab',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'var(--sapTile_Background)',
                border: '1px solid var(--sapList_BorderColor)',
                borderTop: `4px solid ${color}`,
                borderRadius: '6px',
                padding: '8px 10px',
                gap: '3px',
                userSelect: 'none',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              }}
            >
              <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)', textAlign: 'center', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                {s.name}
              </span>
              {s.system_type && (
                <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.65rem', color, textAlign: 'center', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {s.system_type}
                </span>
              )}
              {infraLine && (
                <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.6rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {infraLine}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Popup — positioned in screen space, outside the transform */}
      {popup && (
        <div
          style={{
            position: 'fixed', left: popup.sx + 12, top: popup.sy - 8,
            background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)',
            borderRadius: '6px', zIndex: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            minWidth: '200px', overflow: 'hidden',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ padding: '6px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>
            {popup.ifaceIds.length === 1 ? 'Interface' : `${popup.ifaceIds.length} Interfaces`}
          </div>
          {popup.ifaceIds.map(id => {
            const iface = ifaceIndex.get(id)
            if (!iface) return null
            const active = selectedIfaceId === id
            return (
              <div
                key={id}
                onClick={() => { onSelectIface(id); setPopup(null); setClickedKey(null) }}
                style={{
                  padding: '7px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--sapList_BorderColor)',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: active ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = active ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent' }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: STATUS_COLORS[iface.status] ?? '#888' }} />
                <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', flex: 1 }}>{iface.name}</span>
                {iface.integration_platform && (
                  <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>{iface.integration_platform}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
