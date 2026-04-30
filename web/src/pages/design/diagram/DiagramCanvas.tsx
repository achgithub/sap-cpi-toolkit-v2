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

const NODE_W   = 160
const NODE_H   = 100
const SNAP     = 20
const LABEL_W  = 72  // estimated canvas-unit width for a 10-char label at font-size 11

// Shared toolbar button style
const toolBtn: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)',
  borderRadius: '4px', background: 'var(--sapTile_Background)',
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
  color: 'var(--sapTextColor)', cursor: 'pointer',
}

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

// ── Label builder ─────────────────────────────────────────────────────────────

type LabelItem =
  | { kind: 'count'; text: string; ifaceIds: string[] }
  | { kind: 'ref';   text: string; ifaceId: string }
  | { kind: 'more';  text: string; hiddenIds: string[] }

function buildLabels(
  ifaceIds: string[],
  ifaceIndex: Map<string, IFInterface>,
  mode: 'count' | 'ref',
  lineLen: number,
): LabelItem[] {
  if (mode === 'count') {
    return [{ kind: 'count', text: String(ifaceIds.length), ifaceIds }]
  }

  // Collect ids+refs for interfaces that have a ref set
  const items = ifaceIds
    .map(id => ({ id, ref: ifaceIndex.get(id)?.interface_ref ?? '' }))
    .filter(x => x.ref.length > 0)

  // Fallback to count if no refs set yet
  if (items.length === 0) {
    return [{ kind: 'count', text: String(ifaceIds.length), ifaceIds }]
  }

  const maxFit = Math.max(1, Math.floor(lineLen / (LABEL_W + 12)))

  if (items.length <= maxFit) {
    return items.map(x => ({ kind: 'ref' as const, text: x.ref, ifaceId: x.id }))
  }

  // Show as many as fit; last slot becomes an overflow "…" label
  const shown  = items.slice(0, maxFit - 1)
  const hidden = items.slice(maxFit - 1)
  return [
    ...shown.map(x => ({ kind: 'ref' as const, text: x.ref, ifaceId: x.id })),
    { kind: 'more' as const, text: `+${hidden.length}`, hiddenIds: hidden.map(x => x.id) },
  ]
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
  const [labelMode,  setLabelMode]  = useState<'count' | 'ref'>('count')

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

  // Track project so we know when it changes vs when a filter changes
  const lastProjectId = useRef('')

  // Initialise / re-layout positions
  // - New project load → use DB-saved positions (or Dagre fallback)
  // - Filter change on same project → always re-run Dagre on visible subset
  //   so nodes pack tightly together
  useEffect(() => {
    const pairList    = Array.from(pairs.keys()).map(k => k.split('__') as [string, string])
    const layout      = dagreLayout(systems, pairList)
    const isNewProject = lastProjectId.current !== projectId
    lastProjectId.current = projectId

    setPos(prev => {
      const next = isNewProject ? {} : { ...prev }
      systems.forEach(s => {
        if (isNewProject) {
          next[s.id] = (s.pos_x !== 0 || s.pos_y !== 0)
            ? { x: s.pos_x, y: s.pos_y }
            : (layout[s.id] ?? { x: 60, y: 60 })
        } else {
          // Filter changed — use fresh Dagre layout so nodes move close together
          next[s.id] = layout[s.id] ?? prev[s.id] ?? { x: 60, y: 60 }
        }
      })
      return next
    })
  }, [projectId, systems, pairs])

  const ifaceIndex = useMemo(() => {
    const m = new Map<string, IFInterface>()
    interfaces.forEach(i => m.set(i.id, i))
    return m
  }, [interfaces])

  // ── Fit to view ─────────────────────────────────────────────────────────────

  const fitView = useCallback(() => {
    const el = containerRef.current
    if (!el || systems.length === 0) return
    const rect = el.getBoundingClientRect()
    // Only consider positions of currently-visible systems
    const visiblePos = systems.map(s => pos[s.id]).filter(Boolean)
    if (visiblePos.length === 0) return
    const xs   = visiblePos.map(p => p.x)
    const ys   = visiblePos.map(p => p.y)
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const maxX = Math.max(...xs) + NODE_W, maxY = Math.max(...ys) + NODE_H
    const pad  = 60
    const ns   = Math.min(
      (rect.width  - pad * 2) / Math.max(maxX - minX, 1),
      (rect.height - pad * 2) / Math.max(maxY - minY, 1),
      1.5,
    )
    setScale(ns)
    setPan({ x: (rect.width - (maxX - minX) * ns) / 2 - minX * ns, y: (rect.height - (maxY - minY) * ns) / 2 - minY * ns })
  }, [systems, pos])

  // Keep a stable ref so the auto-fit effect always calls the latest version
  const fitViewRef = useRef(fitView)
  useEffect(() => { fitViewRef.current = fitView })

  // Auto-fit whenever the visible system set changes (filter applied / cleared)
  const sysKey = systems.map(s => s.id).sort().join(',')
  useEffect(() => {
    if (!sysKey) return
    const t = setTimeout(() => fitViewRef.current(), 80)
    return () => clearTimeout(t)
  }, [sysKey])

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
        // Destructure before setPos — the ref may be null by the time
        // the async updater function runs (stale ref crash).
        const { id, ox, oy, mx, my } = drag.current
        const dx = (e.clientX - mx) / scale
        const dy = (e.clientY - my) / scale
        setPos(prev => ({ ...prev, [id]: { x: ox + dx, y: oy + dy } }))
      }
      if (panRef.current) {
        const { px, py, mx, my } = panRef.current
        setPan({ x: px + e.clientX - mx, y: py + e.clientY - my })
      }
    }
    function onUp(e: MouseEvent) {
      if (drag.current) {
        const { id, ox, oy, mx, my } = drag.current
        drag.current = null  // clear before setPos to avoid any re-entrant access
        const nx = snap(ox + (e.clientX - mx) / scale)
        const ny = snap(oy + (e.clientY - my) / scale)
        setPos(prev => ({ ...prev, [id]: { x: nx, y: ny } }))
        onNodeMoved(id, nx, ny)
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

  // Convert a canvas-space point to screen coords for popup positioning
  const canvasToScreen = useCallback((cx: number, cy: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    return {
      sx: cx * scale + pan.x + (rect?.left ?? 0),
      sy: cy * scale + pan.y + (rect?.top  ?? 0),
    }
  }, [scale, pan])

  const onLineClick = useCallback((e: React.MouseEvent, key: string, ifaceIds: string[]) => {
    e.stopPropagation()
    if (clickedKey === key) { setClickedKey(null); setPopup(null); return }
    setClickedKey(key)
    setPopup({ sx: e.clientX, sy: e.clientY, ifaceIds, key })
    if (ifaceIds.length === 1) onSelectIface(ifaceIds[0])
  }, [clickedKey, onSelectIface])

  const onRefClick = useCallback((e: React.MouseEvent, ifaceId: string) => {
    e.stopPropagation()
    setPopup(null); setClickedKey(null)
    onSelectIface(ifaceId)
  }, [onSelectIface])

  const onMoreClick = useCallback((e: React.MouseEvent, key: string, hiddenIds: string[], cx: number, cy: number) => {
    e.stopPropagation()
    const { sx, sy } = canvasToScreen(cx, cy)
    setClickedKey(key)
    setPopup({ sx, sy, ifaceIds: hiddenIds, key })
  }, [canvasToScreen])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      onMouseDown={onBgMouseDown}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--sapBackgroundColor)', cursor: 'grab' }}
    >
      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 6 }}>
        <button onClick={fitView} title="Fit all boxes into view" style={toolBtn}>⤢ Fit</button>
        <button
          onClick={() => setLabelMode(m => m === 'count' ? 'ref' : 'count')}
          title={labelMode === 'count' ? 'Switch to interface ref view' : 'Switch to count view'}
          style={toolBtn}
        >
          {labelMode === 'count' ? '⊞ Refs' : '# Count'}
        </button>
      </div>

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
            const lineLen = Math.hypot(tgt.x - src.x, tgt.y - src.y)

            // Build labels for this line
            const labels = buildLabels(ifaceIds, ifaceIndex, labelMode, lineLen)

            return (
              <g key={key}>
                {/* Wide transparent hit area */}
                <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer' }}
                  onClick={e => onLineClick(e as unknown as React.MouseEvent, key, ifaceIds)} />
                {/* Visible line */}
                <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={stroke} strokeWidth={sw} style={{ pointerEvents: 'none' }} />
                {/* Labels distributed along the line */}
                {labels.map((label, li) => {
                  const t  = (li + 1) / (labels.length + 1)
                  const lx = src.x + t * (tgt.x - src.x)
                  const ly = src.y + t * (tgt.y - src.y)
                  const tw = label.text.length * 5.5 + 12

                  const isClickable = label.kind === 'ref' || label.kind === 'more'
                  const fill = label.kind === 'more' ? 'var(--sapContent_LabelColor)' : stroke

                  function handleLabelClick(e: React.MouseEvent) {
                    e.stopPropagation()
                    if (label.kind === 'ref')  onRefClick(e, label.ifaceId)
                    if (label.kind === 'more') onMoreClick(e, key, label.hiddenIds, lx, ly)
                  }

                  return (
                    <g key={li}
                      style={{ cursor: isClickable ? 'pointer' : 'default', pointerEvents: isClickable ? 'auto' : 'none' }}
                      onClick={isClickable ? handleLabelClick : undefined}
                    >
                      <rect x={lx - tw / 2} y={ly - 9} width={tw} height={18} rx={4}
                        fill="var(--sapTile_Background)" stroke={stroke} strokeWidth={1} />
                      <text x={lx} y={ly + 5} textAnchor="middle"
                        fontSize={11} fontFamily="var(--sapFontFamily)"
                        fill={fill} fontWeight={600}>
                        {label.text}
                      </text>
                    </g>
                  )
                })}
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
            {popup.ifaceIds.length === 1 ? 'Interface' : `${popup.ifaceIds.length} more`}
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
