import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs'
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

// ── Layout algorithms ─────────────────────────────────────────────────────────

export const LAYOUT_OPTIONS = [
  { id: 'stress',     label: 'Organic',      hint: 'Balanced spread — best for dense interconnected graphs' },
  { id: 'layered-lr', label: '→ Left–Right', hint: 'Directed layers left to right — best for clear sender→receiver flows' },
  { id: 'layered-tb', label: '↓ Top–Down',   hint: 'Directed layers top to bottom' },
  { id: 'force',      label: 'Force',        hint: 'Force-directed physics — spreads naturally, good for medium graphs' },
  { id: 'mrtree',     label: 'Tree',         hint: 'Spanning-tree layout — compact hierarchy, good for hub-and-spoke topologies' },
  { id: 'disco',      label: 'Disco',        hint: 'Disconnected components — lays out each isolated cluster separately, then packs them. Best when filters produce multiple unconnected groups' },
] as const

export type LayoutAlgo = typeof LAYOUT_OPTIONS[number]['id']

// ── ELK ───────────────────────────────────────────────────────────────────────

const elk = new ELK()

type Point = { x: number; y: number }
type EdgeSections = Record<string, Point[]>

function elkOptions(algo: LayoutAlgo): Record<string, string> {
  const base = { 'elk.spacing.nodeNode': '80', 'elk.padding': '[top=60,left=60,bottom=60,right=60]' }
  switch (algo) {
    case 'layered-lr':
      return { ...base, 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT',
               'elk.layered.spacing.nodeNodeBetweenLayers': '220',
               'elk.edgeRouting': 'ORTHOGONAL', 'elk.layered.cycleBreaking.strategy': 'GREEDY' }
    case 'layered-tb':
      return { ...base, 'elk.algorithm': 'layered', 'elk.direction': 'DOWN',
               'elk.layered.spacing.nodeNodeBetweenLayers': '180',
               'elk.edgeRouting': 'ORTHOGONAL', 'elk.layered.cycleBreaking.strategy': 'GREEDY' }
    case 'force':
      return { ...base, 'elk.algorithm': 'force', 'elk.force.iterations': '300' }
    case 'mrtree':
      return { ...base, 'elk.algorithm': 'mrtree', 'elk.direction': 'RIGHT',
               'elk.layered.spacing.nodeNodeBetweenLayers': '200' }
    case 'disco':
      return { ...base, 'elk.algorithm': 'disco',
               'elk.disco.componentCompaction.componentLayoutAlgorithm': 'stress',
               'elk.stress.desiredEdgeLength': '250' }
    case 'stress':
    default:
      return { ...base, 'elk.algorithm': 'stress', 'elk.stress.desiredEdgeLength': '250' }
  }
}

async function elkLayout(
  systems: IFSystem[],
  pairs: [string, string][],
  algo: LayoutAlgo,
): Promise<{ pos: Record<string, Point>; sections: EdgeSections }> {
  if (systems.length === 0) return { pos: {}, sections: {} }

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: elkOptions(algo),
    children: systems.map(s => ({ id: s.id, width: NODE_W, height: NODE_H })),
    edges: pairs.map(([a, b]) => ({ id: `${a}__${b}`, sources: [a], targets: [b] })),
  }

  const result = await elk.layout(graph)

  const pos: Record<string, Point> = {}
  result.children?.forEach(n => { if (n.x != null && n.y != null) pos[n.id] = { x: n.x, y: n.y } })

  const sections: EdgeSections = {}
  result.edges?.forEach(e => {
    const sec = (e as any).sections?.[0]
    if (!sec) return
    sections[e.id!] = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
  })

  return { pos, sections }
}


function snap(v: number) { return Math.round(v / SNAP) * SNAP }

// 4-point orthogonal elbow between two boxes (top-left corners).
// Used whenever ELK sections aren't valid (initial DB-position load or after manual drag).
// Routes always leave/enter through a clear gap — never backtracks through the departure box.
function elbowRoute(pa: Point, pb: Point): Point[] {
  const acy = pa.y + NODE_H / 2
  const bcy = pb.y + NODE_H / 2

  const rightA = pa.x + NODE_W
  const rightB = pb.x + NODE_W

  // Determine horizontal relationship
  const gapLR = pb.x - rightA   // positive = clear gap, pa left of pb
  const gapRL = pa.x - rightB   // positive = clear gap, pb left of pa

  let start: Point, end: Point, mid1: Point, mid2: Point

  if (gapLR >= 0) {
    // pa clearly left of pb — exit right of pa, enter left of pb
    start = { x: rightA, y: acy }
    end   = { x: pb.x,  y: bcy }
    const midX = start.x + gapLR / 2
    mid1 = { x: midX, y: acy }; mid2 = { x: midX, y: bcy }
  } else if (gapRL >= 0) {
    // pa clearly right of pb — exit left of pa, enter right of pb
    start = { x: pa.x,   y: acy }
    end   = { x: rightB, y: bcy }
    const midX = end.x + gapRL / 2
    mid1 = { x: midX, y: acy }; mid2 = { x: midX, y: bcy }
  } else {
    // X ranges overlap — route around the outside: exit top/bottom, bend wide
    const acx = pa.x + NODE_W / 2
    const bcx = pb.x + NODE_W / 2
    if (acy <= bcy) {
      // pa above pb: exit bottom of pa, enter top of pb
      start = { x: acx, y: pa.y + NODE_H }
      end   = { x: bcx, y: pb.y }
      const midY = start.y + (end.y - start.y) / 2
      mid1 = { x: acx, y: midY }; mid2 = { x: bcx, y: midY }
    } else {
      // pa below pb: exit top of pa, enter bottom of pb
      start = { x: acx, y: pa.y }
      end   = { x: bcx, y: pb.y + NODE_H }
      const midY = end.y + (start.y - end.y) / 2
      mid1 = { x: acx, y: midY }; mid2 = { x: bcx, y: midY }
    }
  }

  return [start, mid1, mid2, end]
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

  const items = ifaceIds
    .map(id => ({ id, ref: ifaceIndex.get(id)?.interface_ref ?? '' }))
    .filter(x => x.ref.length > 0)

  if (items.length === 0) {
    return [{ kind: 'count', text: String(ifaceIds.length), ifaceIds }]
  }

  const maxFit = Math.max(1, Math.floor(lineLen / (LABEL_W + 12)))

  if (items.length <= maxFit) {
    return items.map(x => ({ kind: 'ref' as const, text: x.ref, ifaceId: x.id }))
  }

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

// ── Polyline path builder ─────────────────────────────────────────────────────

function pointsAttr(pts: Point[]): string {
  return pts.map(p => `${p.x},${p.y}`).join(' ')
}

// Given an ordered list of waypoints, find the midpoint along the total length
// (used for label placement on multi-segment polylines).
function midpointAlongPath(pts: Point[], t: number): Point {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 }
  const segs: number[] = []
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
    segs.push(d)
    total += d
  }
  let target = t * total
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const f = target / segs[i]
      return { x: pts[i].x + f * (pts[i + 1].x - pts[i].x), y: pts[i].y + f * (pts[i + 1].y - pts[i].y) }
    }
    target -= segs[i]
  }
  return pts[pts.length - 1]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiagramCanvas({ projectId, systems, interfaces, config, selectedIfaceId, onSelectIface, onNodeMoved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan,          setPan]          = useState({ x: 40, y: 40 })
  const [scale,        setScale]        = useState(1)
  const [pos,          setPos]          = useState<Record<string, Point>>({})
  const [edgeSections,  setEdgeSections]  = useState<EdgeSections>({})
  const [sectionsValid, setSectionsValid] = useState(false)
  const [layoutAlgo,    setLayoutAlgo]    = useState<LayoutAlgo>('stress')
  const [edgeColors,   setEdgeColors]   = useState<Record<string, string>>(() => loadColors(projectId))
  const [popup,        setPopup]        = useState<{ sx: number; sy: number; ifaceIds: string[]; key: string } | null>(null)
  const [clickedKey,   setClickedKey]   = useState<string | null>(null)
  const [labelMode,    setLabelMode]    = useState<'count' | 'ref'>('count')

  const drag   = useRef<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  // Reload colours if project changes
  useEffect(() => { setEdgeColors(loadColors(projectId)) }, [projectId])

  // Connection pairs (undirected, deduped).
  const pairs = useMemo(() => {
    const visibleIds = new Set(systems.map(s => s.id))
    const map = new Map<string, string[]>()
    interfaces.forEach(iface => {
      if (!iface.sender_system_id) return
      if (!visibleIds.has(iface.sender_system_id)) return
      iface.receivers.forEach(rec => {
        if (!rec.system_id || rec.system_id === iface.sender_system_id) return
        if (!visibleIds.has(rec.system_id)) return
        const key = [iface.sender_system_id!, rec.system_id].sort().join('__')
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(iface.id)
      })
    })
    return map
  }, [systems, interfaces])

  const lastProjectId = useRef('')
  const layoutGen     = useRef(0)

  // Layout: ELK stress algorithm. Async with stale-call guard via layoutGen.
  // - New project load → prefer DB-saved positions; ELK stress layout as fallback for unpositioned nodes.
  // - Filter change    → full ELK stress re-layout (spreads nodes across canvas).
  // Stress algorithm does not produce edge sections — elbowRoute handles all edges.
  useEffect(() => {
    const pairList     = Array.from(pairs.keys()).map(k => k.split('__') as [string, string])
    const isNewProject = lastProjectId.current !== projectId
    lastProjectId.current = projectId
    const gen = ++layoutGen.current

    elkLayout(systems, pairList, layoutAlgo).then(({ pos: layout, sections }) => {
      if (gen !== layoutGen.current) return

      setEdgeSections(sections)

      if (isNewProject) {
        // On project load: prefer DB positions; ELK fills in any unpositioned nodes.
        setSectionsValid(false) // DB positions won't match ELK sections
        setPos(() => {
          const next: Record<string, Point> = {}
          systems.forEach(s => {
            next[s.id] = (s.pos_x !== 0 || s.pos_y !== 0)
              ? { x: s.pos_x, y: s.pos_y }
              : (layout[s.id] ?? { x: 60, y: 60 })
          })
          return next
        })
      } else {
        // Filter or algorithm change: full ELK re-layout.
        // Layered algorithms produce edge sections; stress/force/radial don't.
        setSectionsValid(Object.keys(sections).length > 0)
        setPos(() => {
          const next: Record<string, Point> = {}
          systems.forEach(s => { next[s.id] = layout[s.id] ?? { x: 60, y: 60 } })
          return next
        })
      }
    })
  }, [projectId, systems, pairs, layoutAlgo])

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

  const fitViewRef = useRef(fitView)
  useEffect(() => { fitViewRef.current = fitView })

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
        const { id, ox, oy, mx, my } = drag.current
        const dx = (e.clientX - mx) / scale
        const dy = (e.clientY - my) / scale
        setPos(prev => ({ ...prev, [id]: { x: ox + dx, y: oy + dy } }))
        // Node was dragged manually — sections no longer match layout
        setSectionsValid(false)
      }
      if (panRef.current) {
        const { px, py, mx, my } = panRef.current
        setPan({ x: px + e.clientX - mx, y: py + e.clientY - my })
      }
    }
    function onUp(e: MouseEvent) {
      if (drag.current) {
        const { id, ox, oy, mx, my } = drag.current
        drag.current = null
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
      {/* Toolbar — stop propagation so clicks here don't trigger canvas pan */}
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 6, alignItems: 'center', cursor: 'default' }}
      >
        <button onClick={fitView} title="Fit all boxes into view" style={toolBtn}>⤢ Fit</button>
        <button
          onClick={() => setLabelMode(m => m === 'count' ? 'ref' : 'count')}
          title={labelMode === 'count' ? 'Switch to interface ref view' : 'Switch to count view'}
          style={toolBtn}
        >
          {labelMode === 'count' ? '⊞ Refs' : '# Count'}
        </button>
        <select
          value={layoutAlgo}
          onChange={e => setLayoutAlgo(e.target.value as LayoutAlgo)}
          title="Layout algorithm — changing this re-runs the layout"
          style={{ ...toolBtn, padding: '3px 6px', appearance: 'auto' }}
        >
          {LAYOUT_OPTIONS.map(o => (
            <option key={o.id} value={o.id} title={o.hint}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Transform wrapper */}
      <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})` }}>

        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          {Array.from(pairs.entries()).map(([key, ifaceIds]) => {
            const [aid, bid] = key.split('__')
            const pa = pos[aid], pb = pos[bid]
            if (!pa || !pb) return null

            const highlighted = key === clickedKey
            const color  = edgeColors[key] ?? '#555'
            const stroke = highlighted ? 'var(--sapHighlightColor)' : color
            const sw     = highlighted ? 2.5 : 2

            // ELK orthogonal sections when valid; elbow route otherwise (never straight lines).
            const elkPts   = sectionsValid ? edgeSections[key] : undefined
            const waypoints = (elkPts && elkPts.length >= 2) ? elkPts : elbowRoute(pa, pb)

            const totalLen = waypoints.reduce((acc, p, i) =>
              i === 0 ? acc : acc + Math.hypot(p.x - waypoints[i - 1].x, p.y - waypoints[i - 1].y), 0)

            const labels = buildLabels(ifaceIds, ifaceIndex, labelMode, totalLen)
            const pts    = pointsAttr(waypoints)

            return (
              <g key={key}>
                {/* Wide transparent hit area */}
                <polyline points={pts}
                  stroke="transparent" strokeWidth={16} fill="none" style={{ cursor: 'pointer' }}
                  onClick={e => onLineClick(e as unknown as React.MouseEvent, key, ifaceIds)} />
                {/* Visible line */}
                <polyline points={pts}
                  stroke={stroke} strokeWidth={sw} fill="none" style={{ pointerEvents: 'none' }} />
                {/* Labels distributed along path */}
                {labels.map((label, li) => {
                  const t  = (li + 1) / (labels.length + 1)
                  const lp = midpointAlongPath(waypoints, t)
                  const tw = label.text.length * 5.5 + 12

                  const isClickable = label.kind === 'ref' || label.kind === 'more'
                  const fill = label.kind === 'more' ? 'var(--sapContent_LabelColor)' : stroke

                  function handleLabelClick(e: React.MouseEvent) {
                    e.stopPropagation()
                    if (label.kind === 'ref')  onRefClick(e, label.ifaceId)
                    if (label.kind === 'more') onMoreClick(e, key, label.hiddenIds, lp.x, lp.y)
                  }

                  return (
                    <g key={li}
                      style={{ cursor: isClickable ? 'pointer' : 'default', pointerEvents: isClickable ? 'auto' : 'none' }}
                      onClick={isClickable ? handleLabelClick : undefined}
                    >
                      <rect x={lp.x - tw / 2} y={lp.y - 9} width={tw} height={18} rx={4}
                        fill="var(--sapTile_Background)" stroke={stroke} strokeWidth={1} />
                      <text x={lp.x} y={lp.y + 5} textAnchor="middle"
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
                {(iface.middleware_chain?.length > 0 || iface.integration_platform) && (
                  <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>
                    {iface.middleware_chain?.length > 0 ? iface.middleware_chain[0].platform : iface.integration_platform}
                  </span>
                )}
              </div>
            )
          })}

          {/* Colour picker */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--sapList_BorderColor)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>Line colour</span>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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
