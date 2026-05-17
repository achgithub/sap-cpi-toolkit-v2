import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Interface, LogicalGroup } from './types'
import { getSystemColor } from './types'
import { useRegistryApi } from './useRegistryApi'

const BASE        = '/api/interfaces'
const NODE_W      = 160
const NODE_H      = 100
const HOP_W       = 120
const HOP_H       = 40
const ACCENT_H    = 6
const MIN_LABEL_PX = 100   // screen px straight-line distance needed to show ref label
const OFFSET_STEP  = 55    // canvas px between parallel arcs

// ── Types ─────────────────────────────────────────────────────────────────────

interface NodeDef {
  id: string
  kind: 'system' | 'hop'
  label: string
  color: string
}

interface GraphEdge {
  id: string
  fromId: string
  toId: string
  ref: string
  color: string
  ifaceId: string
  receiverId: string
}

interface EdgePath {
  id: string
  ref: string
  color: string
  d: string          // SVG path data
  lx: number; ly: number  // label midpoint
  ifaceId: string
  receiverId: string
}

interface ContextMenu {
  x: number; y: number
  edgeId: string
  ref: string
  ifaceId: string
}

const STATUS_COLOR: Record<string, string> = {
  active:     '#1B5E20',
  test:       '#0277BD',
  dev:        '#E65100',
  design:     '#6B7280',
  deprecated: '#B71C1C',
}

// ── Layout ────────────────────────────────────────────────────────────────────

function buildGraph(
  groupId: string,
  interfaces: Interface[],
): { nodeDefs: NodeDef[]; edges: GraphEdge[] } {
  const groupIfaces = interfaces
    .filter(i => i.logical_group_id === groupId)
    .sort((a, b) => (a.sequence_in_group ?? 999) - (b.sequence_in_group ?? 999))

  const nodeMap   = new Map<string, NodeDef>()
  const ifaceWt   = new Map<string, number>()  // weight by sender/receiver count only
  const edges: GraphEdge[] = []

  function ensureSys(sysId: string, color: string, name: string) {
    if (!nodeMap.has(sysId)) nodeMap.set(sysId, { id: sysId, kind: 'system', label: name, color })
  }
  function ensureHop(label: string, color: string) {
    const id = `hop:${label}`
    if (!nodeMap.has(id)) nodeMap.set(id, { id, kind: 'hop', label, color })
    return id
  }
  function bump(id: string) { ifaceWt.set(id, (ifaceWt.get(id) ?? 0) + 1) }

  for (const iface of groupIfaces) {
    const edgeColor = STATUS_COLOR[iface.status] ?? '#888'

    if (iface.sender_system_id) { ensureSys(iface.sender_system_id, '#888', iface.sender_system_id); bump(iface.sender_system_id) }

    for (const r of iface.receivers) {
      if (r.system_id) { ensureSys(r.system_id, '#888', r.system_id); bump(r.system_id) }
    }

    if (!iface.sender_system_id) continue
    const ref = iface.ref?.trim() || iface.name

    // Shared via chain — built ONCE per interface (not per receiver)
    let sharedEnd = iface.sender_system_id
    for (let vi = 0; vi < iface.via.length; vi++) {
      const hop   = iface.via[vi]
      const hopId = hop.system_id ?? ensureHop(hop.label, '#6B7280')
      if (hop.system_id) ensureSys(hop.system_id, '#6B7280', hop.label)
      edges.push({ id: `${iface.id}-via-${vi}`, fromId: sharedEnd, toId: hopId, ref, color: edgeColor, ifaceId: iface.id, receiverId: '' })
      sharedEnd = hopId
    }

    // Per-receiver legs branch from the end of the shared chain
    for (const recv of iface.receivers) {
      let prevId = sharedEnd
      for (let hi = 0; hi < recv.via.length; hi++) {
        const hop   = recv.via[hi]
        const hopId = hop.system_id ?? ensureHop(hop.label, '#6B7280')
        if (hop.system_id) ensureSys(hop.system_id, '#6B7280', hop.label)
        edges.push({ id: `${iface.id}-recvvia-${recv.id}-${hi}`, fromId: prevId, toId: hopId, ref, color: edgeColor, ifaceId: iface.id, receiverId: recv.id })
        prevId = hopId
      }
      if (recv.system_id) {
        edges.push({ id: `${iface.id}-${recv.id}`, fromId: prevId, toId: recv.system_id, ref, color: edgeColor, ifaceId: iface.id, receiverId: recv.id })
      }
    }
  }

  // Patch in actual system names/colors (we didn't have api access above)
  return { nodeDefs: [...nodeMap.values()], edges }
}

function radialLayout(
  nodeDefs: NodeDef[],
  edges: GraphEdge[],
  savedPositions: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  if (!nodeDefs.length) return {}

  const CX = 700, CY = 450, R1 = 320, R2 = 240

  // Build undirected adjacency from edges (ignoring hop nodes for weight)
  const adj = new Map<string, Set<string>>()
  for (const n of nodeDefs) adj.set(n.id, new Set())
  for (const e of edges) { adj.get(e.fromId)?.add(e.toId); adj.get(e.toId)?.add(e.fromId) }

  // Sort by adjacency degree (most connected = hub)
  const sorted = [...nodeDefs].sort((a, b) => {
    // System nodes take priority over hop nodes for the hub
    if (a.kind !== b.kind) return a.kind === 'system' ? -1 : 1
    return (adj.get(b.id)?.size ?? 0) - (adj.get(a.id)?.size ?? 0)
  })

  const placed = new Map<string, { x: number; y: number }>()

  // Hub at centre
  placed.set(sorted[0].id, { x: CX, y: CY })

  // Ring 1: direct neighbours of hub
  const ring1 = sorted.filter(n => n.id !== sorted[0].id && (adj.get(sorted[0].id)?.has(n.id) ?? false))

  const placeRing = (items: NodeDef[], r: number, baseAngle = -Math.PI / 2) => {
    items.forEach((n, i) => {
      const angle = baseAngle + (2 * Math.PI * i) / items.length
      placed.set(n.id, { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) })
    })
  }

  if (ring1.length) {
    placeRing(ring1, R1)
    // Ring 2: neighbours of ring-1 not yet placed
    for (const r1 of ring1) {
      const r1pos = placed.get(r1.id)!
      const outward = Math.atan2(r1pos.y - CY, r1pos.x - CX)
      const children = [...(adj.get(r1.id) ?? [])].filter(id => !placed.has(id)).map(id => nodeDefs.find(n => n.id === id)!).filter(Boolean)
      if (!children.length) continue
      const fanHalf = Math.min(Math.PI / 3, (children.length - 1) * 0.4)
      const step = children.length > 1 ? (2 * fanHalf) / (children.length - 1) : 0
      children.forEach((n, i) => {
        const angle = outward - fanHalf + i * step
        placed.set(n.id, { x: r1pos.x + R2 * Math.cos(angle), y: r1pos.y + R2 * Math.sin(angle) })
      })
    }
  }

  // Anything unplaced: distribute in a ring beyond ring-2
  const unplaced = [...nodeDefs].filter(n => !placed.has(n.id))
  if (unplaced.length) placeRing(unplaced, R1 + R2, 0)

  // Apply saved positions as overrides
  const result: Record<string, { x: number; y: number }> = {}
  for (const n of nodeDefs) {
    const saved = savedPositions[n.id]
    const calc  = placed.get(n.id) ?? { x: CX, y: CY }
    result[n.id] = saved ?? calc
  }
  return result
}

// ── Edge geometry ─────────────────────────────────────────────────────────────

function nodeBorderPoint(nx: number, ny: number, nw: number, nh: number, tx: number, ty: number) {
  const cx = nx + nw / 2, cy = ny + nh / 2
  const dx = tx - cx, dy = ty - cy
  const len = Math.hypot(dx, dy)
  if (len < 1) return { x: cx, y: cy }
  const ux = dx / len, uy = dy / len
  const hits: number[] = []
  if (ux > 0) hits.push((nx + nw - cx) / ux)
  if (ux < 0) hits.push((nx - cx) / ux)
  if (uy > 0) hits.push((ny + nh - cy) / uy)
  if (uy < 0) hits.push((ny - cy) / uy)
  const t = Math.min(...hits.filter(h => h > 0))
  return { x: cx + ux * t, y: cy + uy * t }
}

function buildEdgePaths(
  edges: GraphEdge[],
  nodeDefs: NodeDef[],
  posMap: Record<string, { x: number; y: number }>,
  zoom: number,
): EdgePath[] {
  const nodeKind = new Map(nodeDefs.map(n => [n.id, n.kind]))

  // Group by directed source→target pair for offset calculation
  const groups = new Map<string, GraphEdge[]>()
  for (const e of edges) {
    const key = `${e.fromId}→${e.toId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }

  const paths: EdgePath[] = []

  for (const group of groups.values()) {
    const n = group.length
    for (let i = 0; i < n; i++) {
      const e    = group[i]
      const from = posMap[e.fromId]
      const to   = posMap[e.toId]
      if (!from || !to) continue

      const fkind = nodeKind.get(e.fromId) === 'hop'
      const tkind = nodeKind.get(e.toId)   === 'hop'
      const fw = fkind ? HOP_W : NODE_W, fh = fkind ? HOP_H : NODE_H
      const tw = tkind ? HOP_W : NODE_W, th = tkind ? HOP_H : NODE_H

      const fx = from.x + fw / 2, fy = from.y + fh / 2
      const tx = to.x   + tw / 2, ty = to.y   + th / 2

      const dx = tx - fx, dy = ty - fy
      const len = Math.hypot(dx, dy)
      if (len < 1) continue

      // Perpendicular offset — positive offsets arc one way, negative the other
      const px = -dy / len, py = dx / len
      const offset = (i - (n - 1) / 2) * OFFSET_STEP

      // Quadratic bezier control point
      const mx = (fx + tx) / 2 + px * offset
      const my = (fy + ty) / 2 + py * offset

      // Clamp to node borders
      const p1 = nodeBorderPoint(from.x, from.y, fw, fh, mx, my)
      const p2 = nodeBorderPoint(to.x,   to.y,   tw, th, mx, my)

      const d = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`

      // Bezier midpoint (t=0.5)
      const lx = 0.25 * p1.x + 0.5 * mx + 0.25 * p2.x
      const ly = 0.25 * p1.y + 0.5 * my + 0.25 * p2.y

      const screenDist = len * zoom
      const ref = screenDist >= MIN_LABEL_PX ? e.ref : '…'

      paths.push({ id: e.id, ref, color: e.color, d, lx, ly, ifaceId: e.ifaceId, receiverId: e.receiverId })
    }
  }
  return paths
}

// ── Mini-map ──────────────────────────────────────────────────────────────────

const MM_W = 160, MM_H = 100

function MiniMap({ nodeDefs, posMap, pan, zoom, containerW, containerH, onNavigate }: {
  nodeDefs: NodeDef[]
  posMap: Record<string, { x: number; y: number }>
  pan: { x: number; y: number }
  zoom: number
  containerW: number
  containerH: number
  onNavigate: (pan: { x: number; y: number }) => void
}) {
  const mmDragRef = useRef<{ startMx: number; startMy: number; startPan: { x: number; y: number } } | null>(null)

  if (!nodeDefs.length) return null

  const xs = nodeDefs.map(n => posMap[n.id]?.x ?? 0)
  const ys = nodeDefs.map(n => posMap[n.id]?.y ?? 0)
  const minX = Math.min(...xs) - 40
  const minY = Math.min(...ys) - 40
  const maxX = Math.max(...xs) + NODE_W + 40
  const maxY = Math.max(...ys) + NODE_H + 40
  const mmScale = Math.min(MM_W / Math.max(maxX - minX, 1), MM_H / Math.max(maxY - minY, 1))

  const vpMM = {
    x: ((-pan.x / zoom) - minX) * mmScale,
    y: ((-pan.y / zoom) - minY) * mmScale,
    w: (containerW / zoom) * mmScale,
    h: (containerH / zoom) * mmScale,
  }

  function onVpMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    mmDragRef.current = { startMx: e.clientX, startMy: e.clientY, startPan: pan }
  }

  function onSvgMouseMove(e: React.MouseEvent) {
    if (!mmDragRef.current) return
    const { startMx, startMy, startPan } = mmDragRef.current
    const ddx = e.clientX - startMx
    const ddy = e.clientY - startMy
    onNavigate({ x: startPan.x - (ddx / mmScale) * zoom, y: startPan.y - (ddy / mmScale) * zoom })
  }

  function onSvgMouseUp() { mmDragRef.current = null }

  function onBgClick(e: React.MouseEvent<SVGRectElement>) {
    if (mmDragRef.current) return
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const cx = (e.clientX - rect.left) / mmScale + minX
    const cy = (e.clientY - rect.top)  / mmScale + minY
    onNavigate({ x: containerW / 2 - cx * zoom, y: containerH / 2 - cy * zoom })
  }

  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16, zIndex: 30,
      width: MM_W, height: MM_H,
      background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)',
      borderRadius: 6, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <svg width={MM_W} height={MM_H} style={{ display: 'block' }}
        onMouseMove={onSvgMouseMove} onMouseUp={onSvgMouseUp} onMouseLeave={onSvgMouseUp}>
        {/* Clickable background — click to jump */}
        <rect width={MM_W} height={MM_H} fill="transparent" style={{ cursor: 'crosshair' }} onClick={onBgClick} />
        {/* Node thumbnails */}
        {nodeDefs.map(n => {
          const p = posMap[n.id]; if (!p) return null
          const isHop = n.kind === 'hop'
          const mm = { x: (p.x - minX) * mmScale, y: (p.y - minY) * mmScale }
          return <rect key={n.id} x={mm.x} y={mm.y}
            width={Math.max((isHop ? HOP_W : NODE_W) * mmScale, 3)}
            height={Math.max((isHop ? HOP_H : NODE_H) * mmScale, 2)}
            rx={1} fill={n.color} opacity={0.6} style={{ pointerEvents: 'none' }} />
        })}
        {/* Viewport rect — drag to pan */}
        <rect
          x={vpMM.x} y={vpMM.y}
          width={Math.max(vpMM.w, 6)} height={Math.max(vpMM.h, 6)}
          fill="#0070F210" stroke="#0070F2" strokeWidth={1.5} rx={2}
          style={{ cursor: 'move' }}
          onMouseDown={onVpMouseDown}
        />
      </svg>
    </div>
  )
}

// ── Context menu ──────────────────────────────────────────────────────────────

function EdgeContextMenu({ menu, onClose }: { menu: ContextMenu; onClose: () => void }) {
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [onClose])

  const menuItem = (label: string, icon: string, disabled = true) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)',
      borderRadius: 4,
      background: 'transparent',
    }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--sapList_Hover_Background)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <span style={{ fontSize: '0.9rem', width: 16, textAlign: 'center' }}>{icon}</span>
      {label}
    </div>
  )

  return (
    <div
      style={{
        position: 'fixed', left: menu.x, top: menu.y, zIndex: 1000,
        background: 'var(--sapTile_Background)',
        border: '1px solid var(--sapList_BorderColor)',
        borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        minWidth: 220, overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '8px 14px 6px', borderBottom: '1px solid var(--sapList_BorderColor)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          fontFamily: 'monospace', fontSize: '0.72rem', color: 'white',
          background: '#0070F2', borderRadius: 3, padding: '1px 6px',
        }}>{menu.ref}</span>
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
          Interface
        </span>
      </div>
      <div style={{ padding: '4px 0' }}>
        {menuItem('Open in Registry',    '📋')}
        {menuItem('Interface Summary',   '🔍')}
        {menuItem('Open Flow Diagram',   '🗺️')}
        {menuItem('Show Steps',          '📝')}
      </div>
    </div>
  )
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
          {g.description && (
            <div style={{ fontWeight: 'normal', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginTop: 1 }}>
              {g.description}
            </div>
          )}
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
  const [pan,    setPan]    = useState({ x: 40, y: 40 })
  const [zoom,   setZoom]   = useState(1)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; ox: number; oy: number; mx: number; my: number } | null>(null)
  const panRef  = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const posRef  = useRef<Record<string, { x: number; y: number }>>({})

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved positions when group changes
  useEffect(() => {
    if (!selectedGroupId) return
    setSavedPositions({})
    setPan({ x: 40, y: 40 })
    setZoom(1)
    setContextMenu(null)
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

  // Build graph (memoized)
  const { nodeDefs, edges } = useMemo(() => {
    if (!selectedGroupId) return { nodeDefs: [], edges: [] }
    return buildGraph(selectedGroupId, api.interfaces)
  }, [selectedGroupId, api.interfaces])

  // Patch system names and colors into nodeDefs
  const patchedNodeDefs = useMemo(() => nodeDefs.map(n => {
    if (n.kind === 'hop') return n
    const sys = api.systems.find(s => s.id === n.id)
    if (!sys) return n
    return { ...n, label: sys.name, color: getSystemColor(sys.system_type, api.config) }
  }), [nodeDefs, api.systems, api.config])

  // Run layout (memoized)
  const calcPositions = useMemo(() =>
    radialLayout(patchedNodeDefs, edges, savedPositions),
    [patchedNodeDefs, edges, savedPositions] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Sync layout to mutable posRef
  useEffect(() => {
    posRef.current = calcPositions
    setNodePositions({ ...calcPositions })
  }, [calcPositions])

  // Build edge paths (memoized, re-runs on zoom for label density)
  const edgePaths = useMemo(() =>
    buildEdgePaths(edges, patchedNodeDefs, nodePositions, zoom),
    [edges, patchedNodeDefs, nodePositions, zoom]
  )

  // ── Interaction ─────────────────────────────────────────────────────────────

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    setZoom(z => {
      const nz = Math.max(0.15, Math.min(3, z * (e.deltaY < 0 ? 1.1 : 0.909)))
      setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
      return nz
    })
  }

  function adjustZoom(factor: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.width / 2, cy = rect.height / 2
    setZoom(z => {
      const nz = Math.max(0.15, Math.min(3, z * factor))
      setPan(p => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) }))
      return nz
    })
  }

  function onNodeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setContextMenu(null)
    const pos = posRef.current[id]
    dragRef.current = { id, ox: pos.x, oy: pos.y, mx: e.clientX, my: e.clientY }
    setIsDragging(false)
  }

  function onBgMouseDown(e: React.MouseEvent) {
    // Node mousedowns call stopPropagation so they never reach here.
    // Edge clicks use onClick not onMouseDown so they don't interfere.
    setContextMenu(null)
    panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (dragRef.current) {
      setIsDragging(true)
      const { id, ox, oy, mx, my } = dragRef.current
      const dx = (e.clientX - mx) / zoom, dy = (e.clientY - my) / zoom
      const updated = { ...posRef.current, [id]: { x: ox + dx, y: oy + dy } }
      posRef.current = updated
      setNodePositions({ ...updated })
    } else if (panRef.current) {
      const { mx, my, px, py } = panRef.current
      setPan({ x: px + e.clientX - mx, y: py + e.clientY - my })
    }
  }

  const savePositions = useCallback(() => {
    if (!selectedGroupId) return
    const nodes = Object.entries(posRef.current).map(([id, p]) => ({ id, x: p.x, y: p.y }))
    fetch(`${BASE}/logical-groups/${selectedGroupId}/flow-diagram`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupViz: { nodes } }),
    }).catch(() => {})
  }, [selectedGroupId])

  function onMouseUp() {
    if (dragRef.current && isDragging) savePositions()
    dragRef.current = null
    panRef.current  = null
    setIsDragging(false)
  }

  function fit() {
    const pos = Object.values(nodePositions)
    if (!pos.length) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const minX = Math.min(...pos.map(p => p.x))
    const minY = Math.min(...pos.map(p => p.y))
    const maxX = Math.max(...Object.entries(nodePositions).map(([id, p]) => {
      const n = patchedNodeDefs.find(n => n.id === id)
      return p.x + (n?.kind === 'hop' ? HOP_W : NODE_W)
    }))
    const maxY = Math.max(...Object.entries(nodePositions).map(([id, p]) => {
      const n = patchedNodeDefs.find(n => n.id === id)
      return p.y + (n?.kind === 'hop' ? HOP_H : NODE_H)
    }))
    const nz = Math.max(0.15, Math.min((rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY), 2))
    setZoom(nz)
    setPan({ x: 40 - minX * nz, y: 40 - minY * nz })
  }

  function onEdgeClick(e: React.MouseEvent, ep: EdgePath) {
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, edgeId: ep.id, ref: ep.ref === '…' ? ep.id.split('-')[0] : ep.ref, ifaceId: ep.ifaceId })
  }

  const containerRect = containerRef.current?.getBoundingClientRect()

  const toolBtn: React.CSSProperties = {
    padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)',
    borderRadius: 4, background: 'var(--sapTile_Background)',
    fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
    color: 'var(--sapTextColor)', cursor: 'pointer',
  }

  const cursor = isDragging ? 'grabbing' : (panRef.current ? 'grabbing' : 'default')

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left panel */}
      <div style={{
        width: panelCollapsed ? 28 : 210, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_ContentBackground)',
        transition: 'width 0.15s ease', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: panelCollapsed ? '7px 4px' : '7px 8px 7px 12px', flexShrink: 0,
          borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)',
        }}>
          {!panelCollapsed && <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>Groups</span>}
          <button onClick={() => setPanelCollapsed(c => !c)} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem', borderRadius: 3, flexShrink: 0 }}>
            {panelCollapsed ? '›' : '‹'}
          </button>
        </div>
        {!panelCollapsed && <GroupList groups={api.logicalGroups} selectedId={selectedGroupId} onSelect={id => { setSelectedGroupId(id); setContextMenu(null) }} />}
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
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20, display: 'flex', gap: 6, alignItems: 'center' }} onMouseDown={e => e.stopPropagation()}>
              <button style={toolBtn} onClick={fit}>⤢ Fit</button>
              <button style={toolBtn} onClick={() => adjustZoom(1.2)}>＋</button>
              <button style={toolBtn} onClick={() => adjustZoom(0.833)}>－</button>
              <button style={toolBtn} onClick={() => { setSavedPositions({}) }}>↺ Reset</button>
            </div>

            {/* Legend */}
            <div style={{
              position: 'absolute', top: 8, right: 8, zIndex: 20,
              background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)',
              borderRadius: 6, padding: '6px 10px', display: 'flex', gap: 10, alignItems: 'center',
            }} onMouseDown={e => e.stopPropagation()}>
              {Object.entries(STATUS_COLOR).map(([status, color]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 20, height: 3, background: color, borderRadius: 2 }} />
                  <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem', color: 'var(--sapContent_LabelColor)', textTransform: 'capitalize' }}>{status}</span>
                </div>
              ))}
            </div>

            <div
              ref={containerRef}
              style={{ width: '100%', height: '100%', background: 'var(--sapBackgroundColor)', cursor }}
              onMouseDown={onBgMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
            >
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                <defs>
                  <marker id="grp-arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L7,3 z" fill="#555" />
                  </marker>
                </defs>

                <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

                  {/* Pass 1: edge paths + invisible hit areas */}
                  {edgePaths.map(ep => (
                    <g key={ep.id}>
                      {/* Wide transparent hit area */}
                      <path d={ep.d} fill="none" stroke="transparent" strokeWidth={12 / zoom}
                        style={{ cursor: 'pointer' }}
                        onClick={e => onEdgeClick(e, ep)} />
                      {/* Visible edge */}
                      <path d={ep.d} fill="none" stroke={ep.color} strokeWidth={1.5 / zoom}
                        markerEnd="url(#grp-arr)" style={{ pointerEvents: 'none' }} />
                    </g>
                  ))}

                  {/* Pass 2: nodes */}
                  {patchedNodeDefs.map(n => {
                    const p = nodePositions[n.id]
                    if (!p) return null

                    if (n.kind === 'hop') {
                      // Pill-style node for via-hops
                      return (
                        <g key={n.id} transform={`translate(${p.x},${p.y})`}
                          style={{ cursor: isDragging && dragRef.current?.id === n.id ? 'grabbing' : 'grab' }}
                          onMouseDown={e => onNodeMouseDown(e, n.id)}>
                          <rect width={HOP_W} height={HOP_H} rx={HOP_H / 2}
                            fill="var(--sapTile_Background)" stroke={n.color} strokeWidth={1.5} />
                          <text x={HOP_W / 2} y={HOP_H / 2}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={10} fill="var(--sapTextColor)" fontFamily="var(--sapFontFamily)"
                            style={{ userSelect: 'none', pointerEvents: 'none' }}>
                            {n.label.length > 16 ? n.label.slice(0, 15) + '…' : n.label}
                          </text>
                        </g>
                      )
                    }

                    // Full Architecture-style card for systems
                    const sys = api.systems.find(s => s.id === n.id)
                    const infra = [sys?.infra_type, sys?.infra_region].filter(Boolean).join(' · ')
                    return (
                      <g key={n.id} transform={`translate(${p.x},${p.y})`}
                        style={{ cursor: isDragging && dragRef.current?.id === n.id ? 'grabbing' : 'grab' }}
                        onMouseDown={e => onNodeMouseDown(e, n.id)}>
                        <title>{n.label}</title>
                        <rect width={NODE_W} height={NODE_H} rx={6}
                          fill="var(--sapTile_Background)" stroke={n.color} strokeWidth={1.5} />
                        <rect width={NODE_W} height={ACCENT_H} rx={6} fill={n.color} />
                        <rect width={NODE_W} height={3} y={3} fill={n.color} />
                        <text x={NODE_W / 2} y={34}
                          textAnchor="middle" dominantBaseline="middle"
                          fontSize={13} fontWeight="bold"
                          fill="var(--sapTextColor)" fontFamily="var(--sapFontFamily)"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}>
                          {n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label}
                        </text>
                        {sys?.system_type && (
                          <text x={NODE_W / 2} y={56}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={10} fill={n.color} fontFamily="var(--sapFontFamily)"
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
                    const PW = 54 / zoom, PH = 16 / zoom, FS = 9 / zoom
                    return (
                      <g key={`lbl-${ep.id}`} style={{ pointerEvents: 'none' }}>
                        <rect x={ep.lx - PW / 2 - 2 / zoom} y={ep.ly - PH / 2 - 2 / zoom}
                          width={PW + 4 / zoom} height={PH + 4 / zoom}
                          rx={PH / 2 + 2 / zoom} fill="white" />
                        <rect x={ep.lx - PW / 2} y={ep.ly - PH / 2}
                          width={PW} height={PH} rx={PH / 2} fill={ep.color} />
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

              {/* Mini-map */}
              <MiniMap
                nodeDefs={patchedNodeDefs}
                posMap={nodePositions}
                pan={pan}
                zoom={zoom}
                containerW={containerRect?.width ?? 800}
                containerH={containerRect?.height ?? 600}
                onNavigate={setPan}
              />
            </div>
          </>
        )}
      </div>

      {/* Edge context menu */}
      {contextMenu && (
        <EdgeContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
