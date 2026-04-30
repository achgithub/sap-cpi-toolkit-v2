import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'
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

const NODE_W = 140
const NODE_H = 90

// Derive a stable stroke-dasharray from edge_style
function dashArray(style: string): string | undefined {
  if (style === 'dashed') return '8 4'
  if (style === 'dotted') return '2 4'
  return undefined
}

// Pick the React Flow edge type from edge_routing
function edgeType(routing: string): string {
  if (routing === 'straight')   return 'straight'
  if (routing === 'smoothstep') return 'smoothstep'
  return 'default' // bezier
}

function buildLayout(systems: IFSystem[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 160, nodesep: 80 })
  systems.forEach(s => g.setNode(s.id, { width: NODE_W, height: NODE_H }))
  // Add a dummy edge for each unique sender→all-receivers pair so Dagre has structure
  dagre.layout(g)
  return g
}

function buildGraph(
  systems: IFSystem[],
  interfaces: IFInterface[],
  config: RegistryConfig,
  selectedIfaceId: string | null,
) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 160, nodesep: 80 })
  systems.forEach(s => g.setNode(s.id, { width: NODE_W, height: NODE_H }))

  const pairMap = new Map<string, string[]>()
  interfaces.forEach(iface => {
    if (!iface.sender_system_id) return
    iface.receivers.forEach(rec => {
      if (!rec.system_id) return
      const key = `${iface.sender_system_id}__${rec.system_id}`
      if (!pairMap.has(key)) pairMap.set(key, [])
      pairMap.get(key)!.push(iface.id)
    })
  })
  pairMap.forEach((_, key) => {
    const [src, tgt] = key.split('__')
    if (g.hasNode(src) && g.hasNode(tgt)) g.setEdge(src, tgt)
  })
  dagre.layout(g)

  const nodes: Node[] = systems.map(s => {
    const n     = g.node(s.id) ?? { x: 0, y: 0 }
    const color = getSystemColor(s.system_type, config)
    const hasSavedPos = s.pos_x !== 0 || s.pos_y !== 0
    return {
      id: s.id,
      position: hasSavedPos ? { x: s.pos_x, y: s.pos_y } : { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 },
      data: { system: s, color },
      type: 'systemNode',
      style: { width: NODE_W, height: NODE_H },
    }
  })

  // Build one edge per system pair; use the style/routing of the first interface on that pair
  const edges: Edge[] = Array.from(pairMap.entries()).map(([key, ifaceIds]) => {
    const [source, target] = key.split('__')
    // Dominant interface = first active one, else first
    const dominant = interfaces.find(i => ifaceIds.includes(i.id) && i.status === 'active')
      ?? interfaces.find(i => ifaceIds.includes(i.id))
    const selected = selectedIfaceId && ifaceIds.includes(selectedIfaceId)
    const stroke   = selected ? '#0070f2' : '#888'
    const da       = dominant ? dashArray(dominant.edge_style) : undefined
    const etype    = dominant ? edgeType(dominant.edge_routing) : 'default'
    return {
      id: `e-${key}`,
      source,
      target,
      type: etype,
      data: { ifaceIds },
      style: {
        stroke,
        strokeWidth: selected ? 3 : 2,
        strokeDasharray: da,
      },
      label: ifaceIds.length > 1 ? `${ifaceIds.length}` : undefined,
      labelStyle: { fontSize: '0.7rem', fill: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' },
      labelBgStyle: { fill: 'var(--sapTile_Background)', fillOpacity: 0.9 },
      markerEnd: { type: 'arrowclosed' as const, color: stroke },
    }
  })

  return { nodes, edges, pairMap }
}

// Custom square node renderer
function SystemNode({ data }: { data: { system: IFSystem; color: string } }) {
  const { system: s, color } = data
  const infraLine = [s.infra_type, s.infra_region].filter(Boolean).join(' · ')
  return (
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--sapTile_Background)',
      border: `2px solid ${color}`,
      borderRadius: '8px',
      padding: '8px',
      gap: '4px',
    }}>
      {/* Color accent bar */}
      <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: color, flexShrink: 0 }} />
      <span style={{
        fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold',
        color: 'var(--sapTextColor)', textAlign: 'center', lineHeight: 1.2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%',
      }}>
        {s.name}
      </span>
      {s.system_type && (
        <span style={{
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.65rem',
          color, textAlign: 'center', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%',
        }}>
          {s.system_type}
        </span>
      )}
      {infraLine && (
        <span style={{
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.6rem',
          color: 'var(--sapContent_LabelColor)', textAlign: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%',
        }}>
          {infraLine}
        </span>
      )}
    </div>
  )
}

const NODE_TYPES = { systemNode: SystemNode }

export default function DiagramCanvas({ systems, interfaces, config, selectedIfaceId, onSelectIface, onNodeMoved }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [tooltip, setTooltip] = useState<{ x: number; y: number; ifaceIds: string[] } | null>(null)

  const ifaceIndex = useMemo(() => {
    const m = new Map<string, IFInterface>()
    interfaces.forEach(i => m.set(i.id, i))
    return m
  }, [interfaces])

  const rebuildGraph = useCallback(() => {
    const { nodes: n, edges: e } = buildGraph(systems, interfaces, config, selectedIfaceId)
    setNodes(n)
    setEdges(e)
  }, [systems, interfaces, config, selectedIfaceId])

  useEffect(() => { rebuildGraph() }, [systems, interfaces, config])

  // Re-colour/style edges when selection changes without rebuilding positions
  useEffect(() => {
    setEdges(prev => prev.map(e => {
      const ifaceIds = (e.data?.ifaceIds as string[]) ?? []
      const selected = selectedIfaceId && ifaceIds.includes(selectedIfaceId)
      const stroke   = selected ? '#0070f2' : '#888'
      const dominant = interfaces.find(i => ifaceIds.includes(i.id) && i.status === 'active')
        ?? interfaces.find(i => ifaceIds.includes(i.id))
      const da = dominant ? dashArray(dominant.edge_style) : undefined
      return {
        ...e,
        style: { ...e.style as React.CSSProperties, stroke, strokeWidth: selected ? 3 : 2, strokeDasharray: da },
        markerEnd: { type: 'arrowclosed' as const, color: stroke },
      }
    }))
  }, [selectedIfaceId])

  function redraw() {
    // Reset all positions then re-layout with Dagre
    const g = buildLayout(systems)
    setNodes(prev => prev.map(n => {
      const gn = g.node(n.id)
      if (!gn) return n
      return { ...n, position: { x: gn.x - NODE_W / 2, y: gn.y - NODE_H / 2 } }
    }))
    // Persist cleared positions
    systems.forEach(s => onNodeMoved(s.id, 0, 0))
  }

  const onNodeDragStop: NodeMouseHandler = useCallback((_evt, node) => {
    onNodeMoved(node.id, node.position.x, node.position.y)
  }, [onNodeMoved])

  const onEdgeMouseEnter = useCallback((evt: React.MouseEvent, edge: Edge) => {
    const rect = (evt.currentTarget as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
    setTooltip({
      x: evt.clientX - (rect?.left ?? 0),
      y: evt.clientY - (rect?.top ?? 0),
      ifaceIds: (edge.data?.ifaceIds as string[]) ?? [],
    })
  }, [])

  const onEdgeMouseLeave = useCallback(() => setTooltip(null), [])

  const onEdgeClick = useCallback((_evt: React.MouseEvent, edge: Edge) => {
    const ids = (edge.data?.ifaceIds as string[]) ?? []
    if (ids.length === 1) onSelectIface(ids[0])
  }, [onSelectIface])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: '10px', left: '10px', zIndex: 10,
        display: 'flex', gap: '6px',
      }}>
        <button
          onClick={redraw}
          title="Re-run auto-layout (resets manual positions)"
          style={{
            padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)',
            borderRadius: '4px', background: 'var(--sapTile_Background)',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
            color: 'var(--sapTextColor)', cursor: 'pointer',
          }}
        >
          ↺ Redraw
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgeClick={onEdgeClick}
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="var(--sapList_BorderColor)" />
        <Controls />
        <MiniMap
          nodeColor={n => (n.data as { color?: string }).color ?? '#888'}
          maskColor="rgba(0,0,0,0.05)"
          style={{ background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)' }}
        />
      </ReactFlow>

      {tooltip && tooltip.ifaceIds.length > 0 && (
        <div style={{
          position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 8,
          background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '4px', padding: '8px 12px', zIndex: 100, pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', minWidth: '160px',
        }}>
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginBottom: '4px' }}>
            Interfaces
          </div>
          {tooltip.ifaceIds.map(id => {
            const iface = ifaceIndex.get(id)
            if (!iface) return null
            return (
              <div key={id} style={{
                fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
                color: 'var(--sapTextColor)', padding: '2px 0',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span style={{
                  width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                  background: STATUS_COLORS[iface.status] ?? '#888',
                }} />
                {iface.name}
                {iface.integration_platform && (
                  <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.7rem', marginLeft: 'auto' }}>
                    {iface.integration_platform}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
