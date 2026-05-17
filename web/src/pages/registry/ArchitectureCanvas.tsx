import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs'
import type { System, DiagramEdge, RegistryConfig } from './types'
import { STATUS_COLORS, getSystemColor } from './types'

interface Props {
  systems:        System[]
  edges:          DiagramEdge[]
  config:         RegistryConfig
  onNodeMoved:    (id: string, x: number, y: number) => void
  onOpenRegistry: (senderSystemId: string, receiverSystemId: string) => void
}

const NODE_W  = 160
const NODE_H  = 100
const SNAP    = 20
const PALETTE = ['#0070F2', '#E53935', '#43A047', '#FB8C00', '#7B1FA2', '#00ACC1', '#F06292', '#795548']

// ── Layout algorithms ─────────────────────────────────────────────────────────

const LAYOUT_OPTIONS = [
  { id: 'stress',     label: 'Organic'      },
  { id: 'layered-lr', label: '→ Left–Right' },
  { id: 'layered-tb', label: '↓ Top–Down'   },
  { id: 'force',      label: 'Force'        },
  { id: 'mrtree',     label: 'Tree'         },
  { id: 'disco',      label: 'Disco'        },
] as const

type LayoutAlgo = typeof LAYOUT_OPTIONS[number]['id']
type Point      = { x: number; y: number }
type EdgeSections = Record<string, Point[]>

const elk = new ELK()

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
  systems: System[],
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

function elbowRoute(pa: Point, pb: Point): Point[] {
  const acy = pa.y + NODE_H / 2
  const bcy = pb.y + NODE_H / 2
  const rightA = pa.x + NODE_W
  const rightB = pb.x + NODE_W
  const gapLR  = pb.x - rightA
  const gapRL  = pa.x - rightB

  let start: Point, end: Point, mid1: Point, mid2: Point

  if (gapLR >= 0) {
    start = { x: rightA, y: acy };  end = { x: pb.x, y: bcy }
    const midX = start.x + gapLR / 2
    mid1 = { x: midX, y: acy };     mid2 = { x: midX, y: bcy }
  } else if (gapRL >= 0) {
    start = { x: pa.x, y: acy };    end = { x: rightB, y: bcy }
    const midX = end.x + gapRL / 2
    mid1 = { x: midX, y: acy };     mid2 = { x: midX, y: bcy }
  } else {
    const acx = pa.x + NODE_W / 2
    const bcx = pb.x + NODE_W / 2
    if (acy <= bcy) {
      start = { x: acx, y: pa.y + NODE_H }; end = { x: bcx, y: pb.y }
      const midY = start.y + (end.y - start.y) / 2
      mid1 = { x: acx, y: midY };  mid2 = { x: bcx, y: midY }
    } else {
      start = { x: acx, y: pa.y }; end = { x: bcx, y: pb.y + NODE_H }
      const midY = end.y + (start.y - end.y) / 2
      mid1 = { x: acx, y: midY };  mid2 = { x: bcx, y: midY }
    }
  }
  return [start, mid1, mid2, end]
}

function pointsAttr(pts: Point[]): string {
  return pts.map(p => `${p.x},${p.y}`).join(' ')
}

function midpointAlongPath(pts: Point[]): Point {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 }
  const segs: number[] = []
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y)
    segs.push(d); total += d
  }
  let target = total / 2
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const f = target / segs[i]
      return { x: pts[i].x + f * (pts[i+1].x - pts[i].x), y: pts[i].y + f * (pts[i+1].y - pts[i].y) }
    }
    target -= segs[i]
  }
  return pts[pts.length - 1]
}

function loadColors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem('arch_edge_colors') ?? '{}') } catch { return {} }
}
function saveColors(colors: Record<string, string>) {
  localStorage.setItem('arch_edge_colors', JSON.stringify(colors))
}

// ── Popup card ────────────────────────────────────────────────────────────────

interface Popup {
  sx: number; sy: number
  edge: DiagramEdge
  senderName: string
  receiverName: string
}

// ── EdgeRefLabels ─────────────────────────────────────────────────────────────

const LABEL_W  = 58   // approx px width of a ref label pill at font-size 10
const PILL_H   = 18   // pill height in screen px
const MIN_STEP = 130  // minimum centre-to-centre spacing in screen px


function EdgeRefLabels({ pts, refs, color, scale }: {
  pts: Point[]; refs: string[]; color: string; scale: number
}) {
  if (!refs.length || pts.length < 2) return null

  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))

  // Only place labels on the longest segment — avoids crowding the short
  // vertical elbow sections when many edges share the same routing corridor.
  const longestIdx = segs.reduce((best, len, i) => len > segs[best] ? i : best, 0)
  const segLen     = segs[longestIdx]
  const segStart   = pts[longestIdx]
  const segEnd     = pts[longestIdx + 1]

  // How many labels fit on that segment at current zoom?
  const minStepCanvas = MIN_STEP / scale
  if (segLen < minStepCanvas) {
    // Segment too short to show any label — show one … at midpoint
    const mx = (segStart.x + segEnd.x) / 2
    const my = (segStart.y + segEnd.y) / 2
    const lw = LABEL_W / scale, lh = PILL_H / scale
    return (
      <g transform={`translate(${mx},${my})`} style={{ pointerEvents: 'none' }}>
        <rect x={-lw / 2 - 2 / scale} y={-lh / 2 - 2 / scale} width={lw + 4 / scale} height={lh + 4 / scale} rx={(lh / 2) + 2 / scale} fill="white" />
        <rect x={-lw / 2} y={-lh / 2} width={lw} height={lh} rx={lh / 2} fill={color} />
        <text textAnchor="middle" dominantBaseline="middle" fontSize={10 / scale} fill="#fff" fontWeight="600" fontFamily="var(--sapFontFamily)">…</text>
      </g>
    )
  }

  const maxFit  = Math.max(1, Math.floor((segLen - minStepCanvas * 0.5) / minStepCanvas))
  const visible = refs.slice(0, maxFit)
  const overflow = refs.length > visible.length
  const count   = visible.length + (overflow ? 1 : 0)
  const step    = segLen / (count + 1)

  const lw = LABEL_W / scale
  const lh = PILL_H  / scale
  const fs = 10      / scale
  const dx = (segEnd.x - segStart.x) / segLen
  const dy = (segEnd.y - segStart.y) / segLen

  return (
    <>
      {Array.from({ length: count }, (_, li) => {
        const d    = step * (li + 1)
        const pt   = { x: segStart.x + dx * d, y: segStart.y + dy * d }
        const text = li < visible.length ? visible[li].trim() : '…'
        return (
          <g key={li} transform={`translate(${pt.x},${pt.y})`} style={{ pointerEvents: 'none' }}>
            <rect x={-lw / 2 - 2 / scale} y={-lh / 2 - 2 / scale} width={lw + 4 / scale} height={lh + 4 / scale} rx={(lh / 2) + 2 / scale} fill="white" />
            <rect x={-lw / 2} y={-lh / 2} width={lw} height={lh} rx={lh / 2} fill={color} />
            <text textAnchor="middle" dominantBaseline="middle" fontSize={fs} fill="#fff" fontWeight="600" fontFamily="var(--sapFontFamily)">{text}</text>
          </g>
        )
      })}
    </>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const toolBtn: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)',
  borderRadius: '4px', background: 'var(--sapTile_Background)',
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
  color: 'var(--sapTextColor)', cursor: 'pointer',
}

export default function ArchitectureCanvas({ systems, edges, config, onNodeMoved, onOpenRegistry }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan,          setPan]          = useState({ x: 40, y: 40 })
  const [scale,        setScale]        = useState(1)
  const [pos,          setPos]          = useState<Record<string, Point>>({})
  const [edgeSections, setEdgeSections] = useState<EdgeSections>({})
  const [sectionsValid, setSectionsValid] = useState(false)
  const [layoutAlgo,   setLayoutAlgo]   = useState<LayoutAlgo>('stress')
  const [edgeColors,   setEdgeColors]   = useState<Record<string, string>>(() => loadColors())
  const [popup,        setPopup]        = useState<Popup | null>(null)
  const [colorPickKey, setColorPickKey] = useState<string | null>(null)
  const [showRefs,     setShowRefs]     = useState(false)

  const drag   = useRef<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

  // Pairs for ELK — directed, one per edge
  const pairs = useMemo((): [string, string][] => {
    const visibleIds = new Set(systems.map(s => s.id))
    return edges
      .filter(e => visibleIds.has(e.sender_system_id) && visibleIds.has(e.receiver_system_id))
      .map(e => [e.sender_system_id, e.receiver_system_id])
  }, [systems, edges])

  // Key for ELK layout (changes when systems or edges change)
  const layoutKey = systems.map(s => s.id).sort().join(',')
  const layoutGen = useRef(0)
  const prevLayoutKey = useRef('')

  useEffect(() => {
    const isNewData = prevLayoutKey.current !== layoutKey
    prevLayoutKey.current = layoutKey
    const gen = ++layoutGen.current

    elkLayout(systems, pairs, layoutAlgo).then(({ pos: layout, sections }) => {
      if (gen !== layoutGen.current) return
      setEdgeSections(sections)

      if (isNewData) {
        setSectionsValid(false)
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
        setSectionsValid(Object.keys(sections).length > 0)
        setPos(() => {
          const next: Record<string, Point> = {}
          systems.forEach(s => { next[s.id] = layout[s.id] ?? { x: 60, y: 60 } })
          return next
        })
      }
    })
  }, [layoutKey, pairs, layoutAlgo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit view
  const fitView = useCallback(() => {
    const el = containerRef.current
    if (!el || systems.length === 0) return
    const visiblePos = systems.map(s => pos[s.id]).filter(Boolean)
    if (visiblePos.length === 0) return
    const minX = Math.min(...visiblePos.map(p => p.x))
    const minY = Math.min(...visiblePos.map(p => p.y))
    const maxX = Math.max(...visiblePos.map(p => p.x)) + NODE_W
    const maxY = Math.max(...visiblePos.map(p => p.y)) + NODE_H
    const pad  = 60
    const { clientWidth: cw, clientHeight: ch } = el
    const sc = Math.min((cw - pad * 2) / (maxX - minX), (ch - pad * 2) / (maxY - minY), 1.5)
    setScale(sc)
    setPan({ x: pad - minX * sc, y: pad - minY * sc })
  }, [systems, pos])

  useEffect(() => { fitView() }, [systems]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  const onBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setPopup(null)
    setColorPickKey(null)
    panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (drag.current) {
      const { id, ox, oy } = drag.current
      const nx = (e.clientX - pan.x) / scale - ox
      const ny = (e.clientY - pan.y) / scale - oy
      setPos(prev => ({ ...prev, [id]: { x: nx, y: ny } }))
      setSectionsValid(false)
    } else if (panRef.current) {
      const dx = e.clientX - panRef.current.mx
      const dy = e.clientY - panRef.current.my
      setPan({ x: panRef.current.px + dx, y: panRef.current.py + dy })
    }
  }, [pan, scale])

  const onMouseUp = useCallback((_e: React.MouseEvent) => {
    if (drag.current) {
      const { id } = drag.current
      const p = pos[id]
      if (p) {
        const snapped = { x: snap(p.x), y: snap(p.y) }
        setPos(prev => ({ ...prev, [id]: snapped }))
        onNodeMoved(id, snapped.x, snapped.y)
      }
    }
    drag.current  = null
    panRef.current = null
  }, [pos, onNodeMoved])

  const onNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setPopup(null)
    setColorPickKey(null)
    const p = pos[id] ?? { x: 0, y: 0 }
    const cx = (e.clientX - pan.x) / scale
    const cy = (e.clientY - pan.y) / scale
    drag.current = { id, ox: cx - p.x, oy: cy - p.y, mx: e.clientX, my: e.clientY }
  }, [pos, pan, scale])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const rect   = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setScale(s => {
      const ns = Math.min(Math.max(s * factor, 0.15), 3)
      setPan(p => ({ x: mx - (mx - p.x) * (ns / s), y: my - (my - p.y) * (ns / s) }))
      return ns
    })
  }, [])

  const onEdgeClick = useCallback((ev: React.MouseEvent, edge: DiagramEdge) => {
    ev.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const senderName   = systems.find(s => s.id === edge.sender_system_id)?.name   ?? '?'
    const receiverName = systems.find(s => s.id === edge.receiver_system_id)?.name ?? '?'
    setPopup({
      sx: ev.clientX - rect.left,
      sy: ev.clientY - rect.top,
      edge, senderName, receiverName,
    })
    setColorPickKey(null)
  }, [systems])

  // ── Rendering helpers ──────────────────────────────────────────────────────

  const edgeKey = (e: DiagramEdge) => `${e.sender_system_id}__${e.receiver_system_id}`

  function getEdgePts(edge: DiagramEdge): Point[] {
    const key = edgeKey(edge)
    const pa  = pos[edge.sender_system_id]
    const pb  = pos[edge.receiver_system_id]
    if (!pa || !pb) return []
    if (sectionsValid && edgeSections[key]) return edgeSections[key]
    return elbowRoute(pa, pb)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: 'var(--sapBackgroundColor)', cursor: panRef.current ? 'grabbing' : 'default' }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      {/* Toolbar */}
      <div
        style={{ position: 'absolute', top: 8, left: 8, zIndex: 20, display: 'flex', gap: '6px', alignItems: 'center' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <button style={toolBtn} onClick={fitView}>⤢ Fit</button>
        <select
          value={layoutAlgo}
          onChange={e => setLayoutAlgo(e.target.value as LayoutAlgo)}
          style={{ ...toolBtn, cursor: 'pointer' }}
          onMouseDown={e => e.stopPropagation()}
        >
          {LAYOUT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button
          style={{ ...toolBtn, background: showRefs ? '#0070F2' : 'var(--sapTile_Background)', color: showRefs ? 'white' : 'var(--sapTextColor)', borderColor: showRefs ? '#0070F2' : 'var(--sapList_BorderColor)' }}
          onClick={() => setShowRefs(v => !v)}
          title="Toggle between count badge and interface refs along edge"
        >
          {showRefs ? 'Refs' : 'Count'}
        </button>
      </div>

      {/* SVG canvas */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        onMouseDown={onBgMouseDown}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#888" />
            </marker>
          </defs>

          {/* Pass 1: edge lines + hit areas (below nodes) */}
          {edges.map(edge => {
            const pts = getEdgePts(edge)
            if (pts.length < 2) return null
            const key   = edgeKey(edge)
            const color = edgeColors[key] ?? '#888'
            return (
              <g key={key}>
                <polyline points={pointsAttr(pts)} fill="none" stroke="transparent" strokeWidth={16}
                  style={{ cursor: 'pointer' }} onClick={e => onEdgeClick(e, edge)} />
                <polyline points={pointsAttr(pts)} fill="none" stroke={color} strokeWidth={2}
                  style={{ pointerEvents: 'none' }} />
              </g>
            )
          })}

          {/* System nodes */}
          {systems.map(s => {
            const p     = pos[s.id] ?? { x: 60, y: 60 }
            const color = getSystemColor(s.system_type, config)
            const infraLine = [s.infra_type, s.infra_region].filter(Boolean).join(' · ')
            return (
              <g
                key={s.id}
                transform={`translate(${p.x},${p.y})`}
                style={{ cursor: 'grab' }}
                onMouseDown={e => onNodeMouseDown(e, s.id)}
              >
                <rect width={NODE_W} height={NODE_H} rx={6}
                  fill="var(--sapTile_Background)"
                  stroke={color} strokeWidth={2} />
                <rect width={NODE_W} height={6} rx={6} fill={color} />
                <rect width={NODE_W} height={3} y={3} fill={color} />
                <text x={NODE_W / 2} y={30}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={13} fontWeight="bold"
                  fill="var(--sapTextColor)" fontFamily="var(--sapFontFamily)"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {s.name.length > 18 ? s.name.slice(0, 17) + '…' : s.name}
                </text>
                {s.system_type && (
                  <text x={NODE_W / 2} y={52}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={10} fill={color} fontFamily="var(--sapFontFamily)"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {s.system_type}
                  </text>
                )}
                {infraLine && (
                  <text x={NODE_W / 2} y={70}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fill="var(--sapContent_LabelColor)" fontFamily="var(--sapFontFamily)"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {infraLine}
                  </text>
                )}
              </g>
            )
          })}

          {/* Pass 2: edge badges/labels — rendered after nodes so always on top */}
          {edges.map(edge => {
            const pts = getEdgePts(edge)
            if (pts.length < 2) return null
            const key   = edgeKey(edge)
            const color = edgeColors[key] ?? '#888'
            const mid   = midpointAlongPath(pts)
            return (
              <g key={`lbl-${key}`} style={{ pointerEvents: 'none' }}>
                {!showRefs ? (
                  <g transform={`translate(${mid.x},${mid.y})`}>
                    <rect x={-14} y={-10} width={28} height={20} rx={10} fill={color} opacity={0.9} />
                    <text textAnchor="middle" dominantBaseline="middle"
                      fontSize={11} fill="#fff" fontFamily="var(--sapFontFamily)">
                      {edge.count}
                    </text>
                  </g>
                ) : (
                  <EdgeRefLabels pts={pts} refs={edge.refs} color={color} scale={scale} />
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Edge color picker (appears on right-click or palette icon) */}
      {colorPickKey && (
        <div
          style={{ position: 'absolute', top: 60, left: 8, zIndex: 100, background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)', borderRadius: '6px', padding: '8px', display: 'flex', gap: '6px' }}
          onMouseDown={e => e.stopPropagation()}
        >
          {PALETTE.map(c => (
            <div key={c}
              style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', border: edgeColors[colorPickKey] === c ? '2px solid var(--sapTextColor)' : '2px solid transparent' }}
              onClick={() => {
                const next = { ...edgeColors, [colorPickKey]: c }
                setEdgeColors(next); saveColors(next); setColorPickKey(null)
              }}
            />
          ))}
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#888', cursor: 'pointer' }}
            onClick={() => {
              const { [colorPickKey]: _, ...rest } = edgeColors
              setEdgeColors(rest); saveColors(rest); setColorPickKey(null)
            }}
          />
        </div>
      )}

      {/* Popup card */}
      {popup && (
        <div
          style={{
            position: 'absolute', left: Math.min(popup.sx + 10, (containerRef.current?.clientWidth ?? 600) - 300),
            top: Math.min(popup.sy + 10, (containerRef.current?.clientHeight ?? 400) - 200),
            zIndex: 100, minWidth: 220, maxWidth: 300,
            background: 'var(--sapTile_Background)',
            border: '1px solid var(--sapList_BorderColor)',
            borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            padding: '12px',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--sapTextColor)', marginBottom: '4px' }}>
            {popup.senderName} ↔ {popup.receiverName}
          </div>
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '8px' }}>
            {popup.edge.count} interface{popup.edge.count !== 1 ? 's' : ''}
          </div>

          {/* Ref list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px', maxHeight: '140px', overflowY: 'auto' }}>
            {popup.edge.refs.map((ref, i) => (
              <div key={ref} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <code style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--sapTextColor)', flexShrink: 0 }}>{ref}</code>
                <span style={{
                  padding: '1px 6px', borderRadius: '8px', fontSize: '0.68rem',
                  background: STATUS_COLORS[popup.edge.statuses[i]] ?? '#888', color: '#fff', flexShrink: 0,
                }}>
                  {popup.edge.statuses[i]}
                </span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              style={{ ...toolBtn, background: 'var(--sapHighlightColor)', color: '#fff', border: 'none', flex: 1 }}
              onClick={() => { onOpenRegistry(popup.edge.sender_system_id, popup.edge.receiver_system_id); setPopup(null) }}
            >
              Open in Registry
            </button>
            <button style={toolBtn} onClick={() => setPopup(null)}>✕</button>
          </div>

          {/* Color picker toggle */}
          <button
            style={{ ...toolBtn, marginTop: '6px', width: '100%', fontSize: '0.7rem' }}
            onClick={() => { setColorPickKey(edgeKey(popup.edge)); setPopup(null) }}
          >
            Change line colour
          </button>
        </div>
      )}
    </div>
  )
}
