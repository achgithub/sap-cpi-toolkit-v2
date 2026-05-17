import { useEffect, useRef, useState } from 'react'
import type { Interface, LogicalGroup } from './types'
import { getSystemColor } from './types'
import { useRegistryApi } from './useRegistryApi'

const BASE     = '/api/interfaces'
const NODE_W   = 160
const NODE_H   = 100
const ACCENT_H = 6
const MIN_LABEL_PX = 110  // screen px of straight-line distance needed to show a ref label

// ── Types ─────────────────────────────────────────────────────────────────────

interface NodePos  { id: string; x: number; y: number }
interface GraphEdge {
  id: string
  fromId: string
  toId: string
  ref: string
  color: string
}

// ── Layout — radial hub-centric ───────────────────────────────────────────────

function buildLayout(
  groupId: string,
  interfaces: Interface[],
  savedPositions: Record<string, { x: number; y: number }>,
): { nodes: NodePos[]; edges: GraphEdge[] } {
  const groupIfaces = interfaces
    .filter(i => i.logical_group_id === groupId)
    .sort((a, b) => (a.sequence_in_group ?? 999) - (b.sequence_in_group ?? 999))

  // Collect unique system IDs and interface weight (sender+receiver count)
  const sysIds    = new Set<string>()
  const ifaceWeight = new Map<string, number>()
  const edges: GraphEdge[] = []

  const bump = (id: string) => ifaceWeight.set(id, (ifaceWeight.get(id) ?? 0) + 1)

  for (const iface of groupIfaces) {
    if (iface.sender_system_id) { sysIds.add(iface.sender_system_id); bump(iface.sender_system_id) }
    for (const r of iface.receivers) {
      if (r.system_id) { sysIds.add(r.system_id); bump(r.system_id) }
    }
    for (const hop of iface.via) {
      if (hop.system_id) sysIds.add(hop.system_id)
    }
  }

  // Build edges — one per interface leg
  for (const iface of groupIfaces) {
    if (!iface.sender_system_id) continue
    const ref   = iface.ref?.trim() || iface.name
    const color = STATUS_COLOR[iface.status] ?? '#888'
    for (const recv of iface.receivers) {
      if (!recv.system_id) continue
      // Route from last via-hop system if present, else from sender
      const fromId = iface.via.length > 0
        ? (iface.via[iface.via.length - 1].system_id ?? iface.sender_system_id)
        : iface.sender_system_id
      edges.push({ id: `${iface.id}-${recv.id}`, fromId, toId: recv.system_id, ref, color })
    }
  }

  // Hub-centric radial layout
  const CX = 700, CY = 450
  const R1 = 300, R2 = 240

  // Sort by weight desc; hub = highest weight
  const sorted = [...sysIds].sort((a, b) => (ifaceWeight.get(b) ?? 0) - (ifaceWeight.get(a) ?? 0))

  // Build undirected adjacency from edges
  const adj = new Map<string, Set<string>>()
  for (const id of sysIds) adj.set(id, new Set())
  for (const e of edges) {
    adj.get(e.fromId)?.add(e.toId)
    adj.get(e.toId)?.add(e.fromId)
  }

  const placed = new Map<string, { x: number; y: number }>()

  if (sorted.length === 0) return { nodes: [], edges }

  // Hub at centre
  const hubId = sorted[0]
  placed.set(hubId, { x: CX, y: CY })

  // Ring 1: hub's direct neighbours, evenly distributed
  const ring1 = [...sysIds].filter(id => id !== hubId && (adj.get(hubId)?.has(id) ?? false))
  if (ring1.length === 0) {
    // No direct neighbours — place all remaining in ring 1
    sorted.slice(1).forEach((id, i, arr) => {
      const angle = (2 * Math.PI * i) / arr.length - Math.PI / 2
      placed.set(id, { x: CX + R1 * Math.cos(angle), y: CY + R1 * Math.sin(angle) })
    })
  } else {
    ring1.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / ring1.length - Math.PI / 2
      placed.set(id, { x: CX + R1 * Math.cos(angle), y: CY + R1 * Math.sin(angle) })
    })

    // Ring 2: neighbours of ring1 not yet placed, fanned outward from their parent
    for (const r1Id of ring1) {
      const r1pos = placed.get(r1Id)!
      const outward = Math.atan2(r1pos.y - CY, r1pos.x - CX)
      const children = [...(adj.get(r1Id) ?? [])].filter(id => !placed.has(id))
      if (!children.length) continue
      const fanHalf = Math.min(Math.PI / 3, (children.length - 1) * 0.4)
      const step = children.length > 1 ? (2 * fanHalf) / (children.length - 1) : 0
      children.forEach((id, i) => {
        const angle = outward - fanHalf + i * step
        placed.set(id, { x: r1pos.x + R2 * Math.cos(angle), y: r1pos.y + R2 * Math.sin(angle) })
      })
    }
  }

  // Fallback: anything still unplaced goes in a row at the bottom
  let fallX = CX - ((sorted.length - placed.size) * (NODE_W + 30)) / 2
  for (const id of sorted) {
    if (!placed.has(id)) {
      placed.set(id, { x: fallX, y: CY + R1 + R2 + 80 })
      fallX += NODE_W + 40
    }
  }

  // Apply saved positions as overrides
  const nodes: NodePos[] = [...sysIds].map(id => {
    const saved = savedPositions[id]
    const calc  = placed.get(id) ?? { x: CX, y: CY }
    return { id, x: saved?.x ?? calc.x, y: saved?.y ?? calc.y }
  })

  return { nodes, edges }
}

const STATUS_COLOR: Record<string, string> = {
  active:     '#1B5E20',
  test:       '#0277BD',
  dev:        '#E65100',
  design:     '#888',
  deprecated: '#B71C1C',
}

// ── Parallel edge geometry ─────────────────────────────────────────────────────
// Group edges by normalised (from,to) pair, then offset each perpendicular
// to the line by index so they fan apart as visible separate arcs.

interface EdgePath { id: string; ref: string; color: string; d: string; lx: number; ly: number }

function buildEdgePaths(
  edges: GraphEdge[],
  posMap: Map<string, { x: number; y: number }>,
  zoom: number,
): EdgePath[] {
  // Group by undirected pair
  const groups = new Map<string, GraphEdge[]>()
  for (const e of edges) {
    const key = [e.fromId, e.toId].sort().join('__')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }

  const paths: EdgePath[] = []
  const OFFSET_STEP = 30 // canvas units between parallel arcs

  for (const group of groups.values()) {
    const n = group.length
    for (let i = 0; i < n; i++) {
      const e   = group[i]
      const from = posMap.get(e.fromId)
      const to   = posMap.get(e.toId)
      if (!from || !to) continue

      // Node centres
      const x1 = from.x + NODE_W / 2
      const y1 = from.y + NODE_H / 2
      const x2 = to.x   + NODE_W / 2
      const y2 = to.y   + NODE_H / 2

      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy)
      if (len < 1) continue

      // Perpendicular unit vector
      const px = -dy / len
      const py =  dx / len

      // Offset for this edge in the group
      const offset = (i - (n - 1) / 2) * OFFSET_STEP

      // Quadratic bezier control point: midpoint + perpendicular offset
      const mx = (x1 + x2) / 2 + px * offset
      const my = (y1 + y2) / 2 + py * offset

      // Clamp line endpoints to node borders
      const t1 = edgeIntersect(x1, y1, mx, my, from.x, from.y)
      const t2 = edgeIntersect(x2, y2, mx, my, to.x, to.y)

      const d = `M ${t1.x} ${t1.y} Q ${mx} ${my} ${t2.x} ${t2.y}`

      // Label at bezier midpoint (t=0.5): 0.25*P0 + 0.5*P1 + 0.25*P2
      const lx = 0.25 * t1.x + 0.5 * mx + 0.25 * t2.x
      const ly = 0.25 * t1.y + 0.5 * my + 0.25 * t2.y

      // Density check: straight-line screen distance vs threshold
      const screenDist = len * zoom
      const showLabel  = screenDist >= MIN_LABEL_PX

      paths.push({ id: e.id, ref: showLabel ? e.ref : '…', color: e.color, d, lx, ly })
    }
  }
  return paths
}

// Clamp an edge endpoint from node centre toward control point to the node border
function edgeIntersect(cx: number, cy: number, tx: number, ty: number, nx: number, ny: number) {
  const dx = tx - cx, dy = ty - cy
  const len = Math.hypot(dx, dy)
  if (len < 1) return { x: cx, y: cy }
  const ux = dx / len, uy = dy / len
  // Find first border hit (rectangle nx,ny → nx+NODE_W, ny+NODE_H)
  const hits: number[] = []
  if (ux > 0) hits.push((nx + NODE_W - cx) / ux)
  if (ux < 0) hits.push((nx          - cx) / ux)
  if (uy > 0) hits.push((ny + NODE_H - cy) / uy)
  if (uy < 0) hits.push((ny          - cy) / uy)
  const t = Math.min(...hits.filter(h => h > 0))
  return { x: cx + ux * t, y: cy + uy * t }
}

// ── Left panel ────────────────────────────────────────────────────────────────

function GroupList({ groups, selectedId, onSelect }: {
  groups: LogicalGroup[]; selectedId: string | null; onSelect: (id: string) => void
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {groups.length === 0 && (
        <div style={{ padding: 12, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
          No logical groups yet.
        </div>
      )}
      {groups.map(g => (
        <div key={g.id} onClick={() => onSelect(g.id)} style={{
          padding: '6px 12px', cursor: 'pointer',
          background: selectedId === g.id ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
          borderLeft: selectedId === g.id ? '2px solid #0070F2' : '2px solid transparent',
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
          fontWeight: 'bold', color: 'var(--sapTextColor)',
        }}>
          {g.name}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GroupDiagramSvg() {
  const api = useRegistryApi()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [savedPositions,  setSavedPositions]  = useState<Record<string, { x: number; y: number }>>({})
  const [pan,    setPan]    = useState({ x: 0, y: 0 })
  const [zoom,   setZoom]   = useState(1)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const panRef  = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const posRef  = useRef<Record<string, { x: number; y: number }>>({})

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedGroupId) return
    setSavedPositions({})
    setPan({ x: 0, y: 0 })
    setZoom(1)
    fetch(`${BASE}/logical-groups/${selectedGroupId}/flow-diagram`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.groupViz?.nodes?.length) {
          const pos: Record<string, { x: number; y: number }> = {}
          for (const n of data.groupViz.nodes) pos[n.id] = { x: n.x, y: n.y }
          setSavedPositions(pos)
        }
      })
      .catch(() => {})
  }, [selectedGroupId])

  const { nodes, edges } = selectedGroupId
    ? buildLayout(selectedGroupId, api.interfaces, savedPositions)
    : { nodes: [], edges: [] }

  // Keep a mutable ref for node positions so drag handlers don't close over stale state
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  useEffect(() => {
    const m: Record<string, { x: number; y: number }> = {}
    for (const n of nodes) m[n.id] = { x: n.x, y: n.y }
    setNodePositions(m)
    posRef.current = m
  }, [selectedGroupId, savedPositions]) // eslint-disable-line react-hooks/exhaustive-deps

  const posMap = new Map(Object.entries(nodePositions))

  // ── Interaction ─────────────────────────────────────────────────────────────

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 0.909
    setZoom(z => {
      const nz = Math.max(0.15, Math.min(3, z * factor))
      setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
      return nz
    })
  }

  function onNodeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const pos = posRef.current[id]
    dragRef.current = { id, ox: pos.x, oy: pos.y, mx: e.clientX, my: e.clientY }
  }

  function onBgMouseDown(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return
    panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (dragRef.current) {
      const { id, ox, oy, mx, my } = dragRef.current
      const dx = (e.clientX - mx) / zoom
      const dy = (e.clientY - my) / zoom
      const updated = { ...posRef.current, [id]: { x: ox + dx, y: oy + dy } }
      posRef.current = updated
      setNodePositions({ ...updated })
    } else if (panRef.current) {
      const { mx, my, px, py } = panRef.current
      setPan({ x: px + e.clientX - mx, y: py + e.clientY - my })
    }
  }

  function onMouseUp() {
    if (dragRef.current && selectedGroupId) {
      const nodes = Object.entries(posRef.current).map(([id, p]) => ({ id, x: p.x, y: p.y }))
      fetch(`${BASE}/logical-groups/${selectedGroupId}/flow-diagram`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupViz: { nodes } }),
      }).catch(() => {})
    }
    dragRef.current = null
    panRef.current  = null
  }

  function fit() {
    if (!nodes.length) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const minX = Math.min(...nodes.map(n => n.x))
    const minY = Math.min(...nodes.map(n => n.y))
    const maxX = Math.max(...nodes.map(n => n.x + NODE_W))
    const maxY = Math.max(...nodes.map(n => n.y + NODE_H))
    const nz = Math.max(0.15, Math.min((rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY), 2))
    setZoom(nz)
    setPan({ x: 40 - minX * nz, y: 40 - minY * nz })
  }

  function resetLayout() {
    setSavedPositions({})
  }

  const edgePaths = buildEdgePaths(edges, posMap, zoom)

  const toolBtn: React.CSSProperties = {
    padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)',
    borderRadius: 4, background: 'var(--sapTile_Background)',
    fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
    color: 'var(--sapTextColor)', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left panel */}
      <div style={{
        width: panelCollapsed ? 28 : 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_ContentBackground)',
        transition: 'width 0.15s ease', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: panelCollapsed ? '7px 4px' : '7px 8px 7px 12px', flexShrink: 0,
          borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)',
        }}>
          {!panelCollapsed && (
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>Groups</span>
          )}
          <button onClick={() => setPanelCollapsed(c => !c)} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem', borderRadius: 3, flexShrink: 0 }}>
            {panelCollapsed ? '›' : '‹'}
          </button>
        </div>
        {!panelCollapsed && <GroupList groups={api.logicalGroups} selectedId={selectedGroupId} onSelect={setSelectedGroupId} />}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {!selectedGroupId ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
            Select a group to view its diagram.
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20, display: 'flex', gap: 6 }} onMouseDown={e => e.stopPropagation()}>
              <button style={toolBtn} onClick={fit}>⤢ Fit</button>
              <button style={toolBtn} onClick={resetLayout}>↺ Reset layout</button>
            </div>

            <div
              ref={containerRef}
              style={{ width: '100%', height: '100%', background: 'var(--sapBackgroundColor)', cursor: panRef.current ? 'grabbing' : 'default' }}
              onMouseDown={onBgMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
            >
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                <defs>
                  <marker id="grp-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="#666" />
                  </marker>
                </defs>

                <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

                  {/* Pass 1: edge paths */}
                  {edgePaths.map(ep => (
                    <path key={ep.id} d={ep.d}
                      fill="none" stroke={ep.color} strokeWidth={1.5 / zoom}
                      markerEnd="url(#grp-arrow)"
                      style={{ pointerEvents: 'none' }}
                    />
                  ))}

                  {/* Pass 2: nodes (Architecture-style cards) */}
                  {nodes.map(n => {
                    const p     = nodePositions[n.id] ?? { x: n.x, y: n.y }
                    const sys   = api.systems.find(s => s.id === n.id)
                    const color = getSystemColor(sys?.system_type ?? '', api.config)
                    const label = sys?.name ?? n.id
                    const infra = [sys?.infra_type, sys?.infra_region].filter(Boolean).join(' · ')
                    return (
                      <g key={n.id} transform={`translate(${p.x},${p.y})`}
                        style={{ cursor: 'grab' }}
                        onMouseDown={e => onNodeMouseDown(e, n.id)}>
                        {/* Card background */}
                        <rect width={NODE_W} height={NODE_H} rx={6}
                          fill="var(--sapTile_Background)" stroke={color} strokeWidth={1.5} />
                        {/* Colour accent bar */}
                        <rect width={NODE_W} height={ACCENT_H} rx={6} fill={color} />
                        <rect width={NODE_W} height={3} y={3} fill={color} />
                        {/* System name */}
                        <text x={NODE_W / 2} y={34}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={13} fontWeight="bold"
                          fill="var(--sapTextColor)" fontFamily="var(--sapFontFamily)"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}>
                          {label.length > 18 ? label.slice(0, 17) + '…' : label}
                        </text>
                        {sys?.system_type && (
                          <text x={NODE_W / 2} y={56}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={10} fill={color} fontFamily="var(--sapFontFamily)"
                            style={{ userSelect: 'none', pointerEvents: 'none' }}>
                            {sys.system_type}
                          </text>
                        )}
                        {infra && (
                          <text x={NODE_W / 2} y={74}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={9} fill="var(--sapContent_LabelColor)" fontFamily="var(--sapFontFamily)"
                            style={{ userSelect: 'none', pointerEvents: 'none' }}>
                            {infra}
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {/* Pass 3: edge labels — always on top */}
                  {edgePaths.map(ep => {
                    const PILL_W = 54 / zoom, PILL_H = 16 / zoom, FS = 9 / zoom
                    return (
                      <g key={`lbl-${ep.id}`} style={{ pointerEvents: 'none' }}>
                        <rect x={ep.lx - PILL_W / 2 - 2 / zoom} y={ep.ly - PILL_H / 2 - 2 / zoom}
                          width={PILL_W + 4 / zoom} height={PILL_H + 4 / zoom}
                          rx={PILL_H / 2 + 2 / zoom} fill="white" />
                        <rect x={ep.lx - PILL_W / 2} y={ep.ly - PILL_H / 2}
                          width={PILL_W} height={PILL_H}
                          rx={PILL_H / 2} fill={ep.color} />
                        <text x={ep.lx} y={ep.ly}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={FS} fill="#fff" fontWeight="600"
                          fontFamily="var(--sapFontFamily)">
                          {ep.ref}
                        </text>
                      </g>
                    )
                  })}

                </g>
              </svg>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
