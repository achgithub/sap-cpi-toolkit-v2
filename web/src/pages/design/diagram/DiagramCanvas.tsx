import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dagre from '@dagrejs/dagre'
import type { IFSystem, IFInterface, RegistryConfig } from './types'
import { STATUS_COLORS, getSystemColor } from './types'

interface Props {
  projectId: string
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

// 8 colours for edge colouring
const PALETTE = ['#0070F2', '#E53935', '#43A047', '#FB8C00', '#7B1FA2', '#00ACC1', '#F06292', '#795548']

// ── Geometry ──────────────────────────────────────────────────────────────────

function borderPoint(cx: number, cy: number, tx: number, ty: number, w: number, h: number) {
  const dx = tx - cx, dy = ty - cy
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy }
  const sx = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity
  const sy = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity
  const s  = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

function snap(v: number) { return Math.round(v / SNAP) * SNAP }

// ── Dagre initial layout ──────────────────────────────────────────────────────

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

// ── Edge colour persistence (localStorage, per project) ───────────────────────

function loadColors(projectId: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(`diagram_colors_${projectId}`) ?? '{}') } catch { return {} }
}
function saveColors(projectId: string, colors: Record<string, string>) {
  localStorage.setItem(`diagram_colors_${projectId}`, JSON.stringify(colors))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiagramCanvas({ projectId, systems, interfaces, config, selectedIfaceId, onSelectIface, onNodeMoved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan,        setPan]        = useState({ x: 40, y: 40 })
  const [scale,      setScale]      = useState(1)
  const [pos,        setPos]        = useState<Record<string, { x: number; y: number }>>({})
  const [edgeColors, setEdgeColors] = useState<Record<string, string>>(() => loadColors(projectId))
  const [popup,      setPopup]      = useState<{ sx: number; sy: number; ifaceIds: string[]; key: string } | null>(null)
  const [clickedKey, setClickedKey] = useState<string | null>(null)

  const drag   = useRef<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  // Reload colours if project changes
  useEffect(() => { setEdgeColors(loadColors(projectId)) }, [projectId])

  // Connection pairs (undirected, deduped)
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

  // Initialise positions
  useEffect(() => {
    const pairList = Array.from(pairs.keys()).map(k => k.split('__') as [string, string])
    const layout   = dagreLayout(systems, pairList)
    setPos(prev => {
      const next = { ...prev }
      systems.forEach(s => {
        if (!next[s.id]) {
          next[s.id] = (s.pos_x !== 0 || s.pos_y !== 0)
            ? { x: s.pos_x, y: s.pos_y }
            : (layout[s.id] ?? { x: 60, y: 60 })
        }
      })
      Object.keys(next).forEach(id => { if (!systems.find(s => s.id === id)) delete next[id] })
      return next
    })
  }, [systems, pairs])

  const ifaceIndex = useMemo(() => {
    const m = new Map<string, IFInterface>()
    interfaces.forEach(i => m.set(i.id, i))
    return m
  }, [interfaces])

  // ── Fit to view ─────────────────────────────────────────────────────────────

  function fitView() {
    const el = containerRef.current
    if (!el || Object.keys(pos).length === 0) return
    const rect = el.getBoundingClientRect()
    const xs   = Object.values(pos).map(p => p.x)
    const ys   = Object.values(pos).map(p => p.y)
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const maxX = Math.max(...xs) + NODE_W, maxY = Math.max(...ys) + NODE_H
    const pad  = 60
    const ns   = Math.min(
      (rect.width  - pad * 2) / (maxX - minX),
      (rect.height - pad * 2) / (maxY - minY),
      1.5,
    )
    setScale(ns)
    setPan({ x: (rect.width - (maxX - minX) * ns) / 2 - minX * ns, y: (rect.height - (maxY - minY) * ns) / 2 - minY * ns })
  }

  // ── Edge colour ──────────────────────────────────────────────────────────────

  function applyColor(key: string, color: string) {
    setEdgeColors(prev => {
      const next = { ...prev }
      if (color) next[key] = color; else delete next[key]
      saveColors(projectId, next)
      return next
    })
  }

  // ── Mouse / wheel handlers ───────────────────────────────────────────────────

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (drag.current) {
        const dx = (e.clientX - drag.current.mx) / scale
        const dy = (e.clientY - drag.current.my) / scale
        setPos(prev => ({ ...prev, [drag.current!.id]: { x: drag.current!.ox + dx, y: drag.current!.oy + dy } }))
      }
      if (panRef.current) {
        setPan({ x: panRef.current.px + e.clientX - panRef.current.mx, y: panRef.current.py + e.clientY - panRef.current.my })
      }
    }
    function onUp(e: MouseEvent) {
      if (drag.current) {
        const id = drag.current.id
        const nx = snap((drag.current.ox + (e.clientX - drag.current.mx) / scale))
        const ny = snap((drag.current.oy + (e.clientY - drag.current.my) / scale))
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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setScale(s => {
        const ns = Math.max(0.2, Math.min(3, s * (e.deltaY < 0 ? 1.1 : 0.9)))
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
    setPopup({ sx: e.clientX, sy: e.clientY, ifaceIds, key })
    if (ifaceIds.length === 1) onSelectIface(ifaceIds[0])
  }, [clickedKey, onSelectIface])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      onMouseDown={onBgMouseDown}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--sapBackgroundColor)', cursor: 'grab' }}
    >
      {/* Fit button */}
      <button
        onClick={fitView}
        title="Fit all boxes into view"
        style={{
          position: 'absolute', top: 10, left: 10, zIndex: 10,
          padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '4px', background: 'var(--sapTile_Background)',
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
          color: 'var(--sapTextColor)', cursor: 'pointer',
        }}
      >
        ⤢ Fit
      </button>

      {/* Transform wrapper */}
      <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})` }}>

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
            const color  = edgeColors[key] ?? '#555'
            const stroke = highlighted ? 'var(--sapHighlightColor)' : color
            const sw     = highlighted ? 2.5 : 2
            const mx     = (src.x + tgt.x) / 2, my = (src.y + tgt.y) / 2
            const count  = ifaceIds.length
            return (
              <g key={key}>
                <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer' }}
                  onClick={e => onLineClick(e as unknown as React.MouseEvent, key, ifaceIds)} />
                <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={stroke} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
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

        {systems.map(s => {
          const p = pos[s.id]
          if (!p) return null
          const color     = getSystemColor(s.system_type, config)
          const infraLine = [s.infra_type, s.infra_region].filter(Boolean).join(' · ')
          return (
            <div
              key={s.id}
              onMouseDown={e => onBoxMouseDown(e, s.id)}
              style={{
                position: 'absolute', left: p.x, top: p.y, width: NODE_W, height: NODE_H,
                boxSizing: 'border-box', cursor: 'grab', userSelect: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'var(--sapTile_Background)',
                border: '1px solid var(--sapList_BorderColor)',
                borderTop: `4px solid ${color}`,
                borderRadius: '6px', padding: '8px 10px', gap: '3px',
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

      {/* Click popup — interface list + colour picker */}
      {popup && (
        <div
          style={{
            position: 'fixed', left: popup.sx + 12, top: popup.sy - 8,
            background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)',
            borderRadius: '6px', zIndex: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            minWidth: '210px', overflow: 'hidden',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Interface list */}
          <div style={{ padding: '6px 12px', background: 'var(--sapGroup_TitleBackground)', borderBottom: '1px solid var(--sapList_BorderColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>
            {popup.ifaceIds.length === 1 ? 'Interface' : `${popup.ifaceIds.length} Interfaces`}
          </div>
          {popup.ifaceIds.map(id => {
            const iface  = ifaceIndex.get(id)
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

          {/* Colour picker */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--sapList_BorderColor)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>Line colour</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {/* Reset to default */}
              <button
                onClick={() => applyColor(popup.key, '')}
                title="Reset to default"
                style={{
                  width: 18, height: 18, borderRadius: 3, cursor: 'pointer', padding: 0,
                  border: !edgeColors[popup.key] ? '2px solid var(--sapTextColor)' : '1px solid var(--sapList_BorderColor)',
                  background: '#555', flexShrink: 0,
                }}
              />
              {PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => applyColor(popup.key, c)}
                  title={c}
                  style={{
                    width: 18, height: 18, borderRadius: 3, cursor: 'pointer', padding: 0,
                    background: c, flexShrink: 0,
                    border: edgeColors[popup.key] === c ? '2px solid var(--sapTextColor)' : '1px solid transparent',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
