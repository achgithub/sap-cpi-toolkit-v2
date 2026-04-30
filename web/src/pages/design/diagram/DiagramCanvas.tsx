import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, Handle, Position,
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

// Normalise a system pair to a single undirected key so A→B and B→A share one edge.
// Returns null if both IDs are the same (self-loop — skip).
function pairKey(a: string, b: string): string | null {
  if (a === b) return null
  return [a, b].sort().join('__')
}

function buildGraph(
  systems: IFSystem[],
  interfaces: IFInterface[],
  config: RegistryConfig,
  clickedKey: string | null,
) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 220, nodesep: 80, marginx: 40, marginy: 40 })
  systems.forEach(s => g.setNode(s.id, { width: NODE_W, height: NODE_H }))

  // Build undirected pair map — one entry per unique system pair
  const pairMap = new Map<string, string[]>() // key → interface ids
  interfaces.forEach(iface => {
    if (!iface.sender_system_id) return
    iface.receivers.forEach(rec => {
      if (!rec.system_id) return
      const key = pairKey(iface.sender_system_id!, rec.system_id)
      if (!key) return
      if (!pairMap.has(key)) pairMap.set(key, [])
      pairMap.get(key)!.push(iface.id)
    })
  })

  // Feed edges into Dagre so it can rank nodes correctly
  pairMap.forEach((_, key) => {
    const [a, b] = key.split('__')
    if (g.hasNode(a) && g.hasNode(b)) g.setEdge(a, b)
  })
  dagre.layout(g)

  const nodes: Node[] = systems.map(s => {
    const n = g.node(s.id) ?? { x: 0, y: 0 }
    const color = getSystemColor(s.system_type, config)
    const hasSavedPos = s.pos_x !== 0 || s.pos_y !== 0
    return {
      id: s.id,
      position: hasSavedPos
        ? { x: s.pos_x, y: s.pos_y }
        : { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 },
      data: { system: s, color },
      type: 'systemNode',
      style: { width: NODE_W, height: NODE_H },
    }
  })

  const edges: Edge[] = Array.from(pairMap.entries()).map(([key, ifaceIds]) => {
    const [source, target] = key.split('__')
    const highlighted = key === clickedKey
    return {
      id: `e-${key}`,
      source,
      target,
      type: 'smoothstep',
      data: { ifaceIds, key },
      // No markerEnd → no arrows
      style: {
        stroke: highlighted ? 'var(--sapHighlightColor)' : '#aaa',
        strokeWidth: highlighted ? 2.5 : 1.5,
      },
      label: ifaceIds.length > 1 ? `${ifaceIds.length}` : undefined,
      labelStyle: {
        fontSize: '0.68rem', fill: 'var(--sapContent_LabelColor)',
        fontFamily: 'var(--sapFontFamily)', fontWeight: 600,
      },
      labelBgStyle: { fill: 'var(--sapTile_Background)', fillOpacity: 0.9 },
    }
  })

  return { nodes, edges }
}

// ── Custom node ───────────────────────────────────────────────────────────────

// Left/right handles only — forces edges to stay horizontal between Dagre ranks.
// opacity:0 keeps them invisible but in the DOM so React Flow can measure positions.
const HIDDEN: React.CSSProperties = { opacity: 0, width: 8, height: 8, border: 'none' }

function SystemNode({ data }: { data: { system: IFSystem; color: string } }) {
  const { system: s, color } = data
  const infraLine = [s.infra_type, s.infra_region].filter(Boolean).join(' · ')
  return (
    <>
      <Handle type="target" position={Position.Left}  style={HIDDEN} id="l" />
      <Handle type="source" position={Position.Right} style={HIDDEN} id="r" />
      <div style={{
        width: '100%', height: '100%', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'var(--sapTile_Background)',
        border: '1px solid var(--sapList_BorderColor)',
        borderTop: `4px solid ${color}`,
        borderRadius: '6px',
        padding: '8px 10px',
        gap: '3px',
      }}>
        <span style={{
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold',
          color: 'var(--sapTextColor)', textAlign: 'center', lineHeight: 1.25,
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
    </>
  )
}

const NODE_TYPES = { systemNode: SystemNode }

// ── Canvas ────────────────────────────────────────────────────────────────────

export default function DiagramCanvas({ systems, interfaces, config, selectedIfaceId, onSelectIface, onNodeMoved }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [clickedKey, setClickedKey]     = useState<string | null>(null)
  const [popup, setPopup]               = useState<{ x: number; y: number; ifaceIds: string[] } | null>(null)

  const ifaceIndex = useMemo(() => {
    const m = new Map<string, IFInterface>()
    interfaces.forEach(i => m.set(i.id, i))
    return m
  }, [interfaces])

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(systems, interfaces, config, clickedKey)
    setNodes(n)
    setEdges(e)
  }, [systems, interfaces, config])

  // Re-highlight edges on selection change without resetting node positions
  useEffect(() => {
    setEdges(prev => prev.map(e => {
      const highlighted = (e.data?.key as string) === clickedKey
      return {
        ...e,
        style: {
          stroke: highlighted ? 'var(--sapHighlightColor)' : '#aaa',
          strokeWidth: highlighted ? 2.5 : 1.5,
        },
      }
    }))
  }, [clickedKey])

  const onNodeDragStop: NodeMouseHandler = useCallback((_evt, node) => {
    onNodeMoved(node.id, node.position.x, node.position.y)
  }, [onNodeMoved])

  const onEdgeClick = useCallback((evt: React.MouseEvent, edge: Edge) => {
    evt.stopPropagation()
    const key      = edge.data?.key as string
    const ifaceIds = (edge.data?.ifaceIds as string[]) ?? []
    const rect     = (evt.currentTarget as HTMLElement).closest('.react-flow')?.getBoundingClientRect()

    // Toggle off if clicking the same edge twice
    if (clickedKey === key) {
      setClickedKey(null); setPopup(null); return
    }

    setClickedKey(key)
    setPopup({ x: evt.clientX - (rect?.left ?? 0), y: evt.clientY - (rect?.top ?? 0), ifaceIds })

    // Auto-open detail if only one interface on this connection
    if (ifaceIds.length === 1) onSelectIface(ifaceIds[0])
  }, [clickedKey, onSelectIface])

  const onPaneClick = useCallback(() => {
    setClickedKey(null); setPopup(null)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.3 }}
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

      {/* Click popup listing interfaces on this connection */}
      {popup && popup.ifaceIds.length > 0 && (
        <div style={{
          position: 'absolute',
          left: popup.x + 12,
          top: popup.y - 8,
          background: 'var(--sapTile_Background)',
          border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '6px',
          zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          minWidth: '200px',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '6px 12px',
            background: 'var(--sapGroup_TitleBackground)',
            borderBottom: '1px solid var(--sapList_BorderColor)',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem',
            color: 'var(--sapContent_LabelColor)', fontWeight: 600,
          }}>
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
                <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', flex: 1 }}>
                  {iface.name}
                </span>
                {iface.integration_platform && (
                  <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>
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
