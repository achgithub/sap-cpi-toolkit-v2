import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeMouseHandler,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'
import type { IFSystem, IFInterface } from './types'
import { STATUS_COLORS } from './types'

interface Props {
  systems: IFSystem[]
  interfaces: IFInterface[]
  selectedIfaceId: string | null
  onSelectIface: (id: string | null) => void
  onNodeMoved: (id: string, x: number, y: number) => void
}

const NODE_W = 160
const NODE_H = 50

function buildGraph(systems: IFSystem[], interfaces: IFInterface[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 60 })
  systems.forEach(s => g.setNode(s.id, { width: NODE_W, height: NODE_H }))

  // Collect unique sender→receiver system pairs and which interfaces use each
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
    g.setEdge(src, tgt)
  })

  dagre.layout(g)

  const nodes: Node[] = systems.map(s => {
    const n = g.node(s.id)
    const hasSavedPos = s.pos_x !== 0 || s.pos_y !== 0
    return {
      id: s.id,
      position: hasSavedPos ? { x: s.pos_x, y: s.pos_y } : { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 },
      data: { label: s.name, systemType: s.system_type },
      style: {
        width: NODE_W,
        background: 'var(--sapTile_Background)',
        border: '1px solid var(--sapList_BorderColor)',
        borderRadius: '6px',
        fontSize: '0.8rem',
        fontFamily: 'var(--sapFontFamily)',
        color: 'var(--sapTextColor)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center' as const,
      },
    }
  })

  const edges: Edge[] = Array.from(pairMap.entries()).map(([key, ifaceIds]) => {
    const [source, target] = key.split('__')
    return {
      id: `e-${key}`,
      source,
      target,
      data: { ifaceIds },
      animated: false,
      style: { stroke: 'var(--sapHighlightColor)', strokeWidth: 2 },
      label: ifaceIds.length > 1 ? `${ifaceIds.length}` : undefined,
      labelStyle: {
        fontSize: '0.7rem',
        fill: 'var(--sapTextColor)',
        fontFamily: 'var(--sapFontFamily)',
      },
      labelBgStyle: { fill: 'var(--sapTile_Background)' },
    }
  })

  return { nodes, edges, pairMap }
}

export default function DiagramCanvas({ systems, interfaces, selectedIfaceId, onSelectIface, onNodeMoved }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [tooltip, setTooltip] = useState<{ x: number; y: number; ifaceIds: string[] } | null>(null)

  const ifaceIndex = useMemo(() => {
    const m = new Map<string, IFInterface>()
    interfaces.forEach(i => m.set(i.id, i))
    return m
  }, [interfaces])

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(systems, interfaces)
    setNodes(n)
    setEdges(e)
  }, [systems, interfaces])

  const onConnect = useCallback((conn: Connection) => {
    setEdges(eds => addEdge(conn, eds))
  }, [])

  const onNodeDragStop: NodeMouseHandler = useCallback((_evt, node) => {
    onNodeMoved(node.id, node.position.x, node.position.y)
  }, [onNodeMoved])

  const onEdgeMouseEnter = useCallback((_evt: React.MouseEvent, edge: Edge) => {
    const rect = (_evt.currentTarget as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
    setTooltip({
      x: _evt.clientX - (rect?.left ?? 0),
      y: _evt.clientY - (rect?.top ?? 0),
      ifaceIds: (edge.data?.ifaceIds as string[]) ?? [],
    })
  }, [])

  const onEdgeMouseLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  const onEdgeClick = useCallback((_evt: React.MouseEvent, edge: Edge) => {
    const ids = (edge.data?.ifaceIds as string[]) ?? []
    if (ids.length === 1) {
      onSelectIface(ids[0])
    }
    // if multiple, tooltip already shows the list for user to click
  }, [onSelectIface])

  // Highlight selected interface's edge
  const styledEdges = useMemo((): Edge[] => edges.map(e => {
    const ifaceIds = (e.data?.ifaceIds as string[]) ?? []
    const active = selectedIfaceId && ifaceIds.includes(selectedIfaceId)
    return {
      ...e,
      style: {
        ...(e.style as React.CSSProperties),
        stroke: active ? STATUS_COLORS['active'] : 'var(--sapHighlightColor)',
        strokeWidth: active ? 3 : 2,
      },
    }
  }), [edges, selectedIfaceId])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgeClick={onEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="var(--sapList_BorderColor)" />
        <Controls />
        <MiniMap
          nodeColor="var(--sapHighlightColor)"
          maskColor="rgba(0,0,0,0.05)"
          style={{ background: 'var(--sapTile_Background)', border: '1px solid var(--sapList_BorderColor)' }}
        />
      </ReactFlow>

      {tooltip && tooltip.ifaceIds.length > 0 && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + 12,
          top: tooltip.y - 8,
          background: 'var(--sapTile_Background)',
          border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '4px',
          padding: '8px 12px',
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          minWidth: '160px',
        }}>
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '4px' }}>
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
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: STATUS_COLORS[iface.status] ?? 'var(--sapNeutralColor)',
                  flexShrink: 0,
                }} />
                {iface.name}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
