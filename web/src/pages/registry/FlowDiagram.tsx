import { useEffect, useState } from 'react'
import { useRegistryApi } from './useRegistryApi'
import type { Interface, System } from './types'
import FlowCanvas, { type FlowDiagramState, type FlowNode, type FlowEdge, FLOW_DEFAULTS, flowUid } from './FlowCanvas'

const BASE = '/api/interfaces'

// ── Initial layout generator ──────────────────────────────────────────────────

function snapV(v: number) { return Math.round(v / 10) * 10 }

function buildInterfaceState(iface: Interface, systems: System[]): FlowDiagramState {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  const sysW = FLOW_DEFAULTS.system.w
  const sysH = FLOW_DEFAULTS.system.h
  const hopW = FLOW_DEFAULTS.hop.w
  const hopH = FLOW_DEFAULTS.hop.h
  const gap = 80

  let x = 60
  const topY = 40

  // right-center / left-center helpers for edge anchoring
  const rc = (n: FlowNode) => ({ x: n.x + n.width, y: n.y + n.height / 2 })
  const lc = (n: FlowNode) => ({ x: n.x,            y: n.y + n.height / 2 })

  // Sender system box
  const senderSys = systems.find(s => s.id === iface.sender_system_id)
  const senderNode: FlowNode = {
    id: flowUid(), type: 'system',
    label: senderSys?.name ?? 'Sender',
    x, y: topY, width: sysW, height: sysH,
    color: FLOW_DEFAULTS.system.color, fontSize: FLOW_DEFAULTS.system.fs,
    nodeKey: 'sender',
  }
  nodes.push(senderNode)

  x += sysW + gap

  // Shared via hops
  let prevNode: FlowNode = senderNode

  for (let vi = 0; vi < iface.via.length; vi++) {
    const hop = iface.via[vi]
    const hopNode: FlowNode = {
      id: flowUid(), type: 'hop', label: hop.label,
      x, y: snapV(topY + (sysH - hopH) / 2), width: hopW, height: hopH,
      color: FLOW_DEFAULTS.hop.color, fontSize: FLOW_DEFAULTS.hop.fs,
      nodeKey: `via-${vi}`,
    }
    nodes.push(hopNode)
    edges.push({ id: flowUid(), fromNodeId: prevNode.id, toNodeId: hopNode.id, path: [rc(prevNode), lc(hopNode)], label: '', arrow: 'end' })
    prevNode = hopNode
    x += hopW + gap
  }

  // Receivers (stacked vertically if multiple)
  let recvY = topY
  for (let ri = 0; ri < iface.receivers.length; ri++) {
    const recv = iface.receivers[ri]
    const recvSys = systems.find(s => s.id === recv.system_id)

    // Per-receiver via hops (branch off from shared end)
    let branchNode = prevNode
    let branchX = x

    for (let hi = 0; hi < recv.via.length; hi++) {
      const hop = recv.via[hi]
      const hopNode: FlowNode = {
        id: flowUid(), type: 'hop', label: hop.label,
        x: branchX, y: snapV(recvY + (sysH - hopH) / 2), width: hopW, height: hopH,
        color: FLOW_DEFAULTS.hop.color, fontSize: FLOW_DEFAULTS.hop.fs,
        nodeKey: `recv-${ri}-via-${hi}`,
      }
      nodes.push(hopNode)
      edges.push({ id: flowUid(), fromNodeId: branchNode.id, toNodeId: hopNode.id, path: [rc(branchNode), lc(hopNode)], label: '', arrow: 'end' })
      branchNode = hopNode
      branchX += hopW + gap
    }

    const recvNode: FlowNode = {
      id: flowUid(), type: 'system',
      label: recvSys?.name ?? 'Receiver',
      x: branchX, y: recvY, width: sysW, height: sysH,
      color: FLOW_DEFAULTS.system.color, fontSize: FLOW_DEFAULTS.system.fs,
      nodeKey: `recv-${ri}`,
    }
    nodes.push(recvNode)
    edges.push({ id: flowUid(), fromNodeId: branchNode.id, toNodeId: recvNode.id, path: [rc(branchNode), lc(recvNode)], label: '', arrow: 'end' })

    recvY += sysH + gap
  }

  // If no receivers, just leave sender + hops
  return { nodes, edges }
}

// ── Left panel items ──────────────────────────────────────────────────────────

function GroupLabel({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 12px',
      fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
      fontWeight: 'bold', color: 'var(--sapContent_LabelColor)',
      borderLeft: '2px solid transparent',
      userSelect: 'none',
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
    </div>
  )
}

function PanelItem({ label, badge, depth, selected, onClick }: {
  label: string; badge?: string; depth: number; selected: boolean; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: `5px 12px 5px ${12 + depth * 12}px`,
        cursor: 'pointer',
        background: selected ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
        borderLeft: selected ? '2px solid #0070F2' : '2px solid transparent',
        fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
        fontWeight: depth === 0 && !badge ? 'bold' : 'normal',
        color: 'var(--sapTextColor)',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--sapContent_LabelColor)',
          background: 'var(--sapList_Background)', border: '1px solid var(--sapList_BorderColor)',
          borderRadius: 3, padding: '0 3px', flexShrink: 0,
        }}>{badge.trim()}</span>
      )}
    </div>
  )
}

// ── FlowDiagram ───────────────────────────────────────────────────────────────

export default function FlowDiagram() {
  const api = useRegistryApi()
  const [selId, setSelId] = useState<string | null>(null)
  const [state, setState] = useState<FlowDiagramState | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [panelCollapsed, setPanelCollapsed] = useState(false)

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function select(id: string) {
    setSelId(id)
    setLoadErr('')
    setState(null)
    try {
      const res = await fetch(`${BASE}/interfaces/${id}/flow-diagram`)
      const data = await res.json()
      if (data && Array.isArray(data.nodes) && data.nodes.length > 0) {
        setState(data as FlowDiagramState)
      } else {
        const iface = api.interfaces.find(i => i.id === id)
        if (iface) setState(buildInterfaceState(iface, api.systems))
      }
    } catch {
      setLoadErr('Failed to load diagram state')
    }
  }

  async function save(newState: FlowDiagramState) {
    if (!selId) return
    setSaving(true)
    try {
      await fetch(`${BASE}/interfaces/${selId}/flow-diagram`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState),
      })
      setState(newState)
    } finally {
      setSaving(false)
    }
  }

  function reseed() {
    if (!selId) return
    if (!window.confirm('Regenerate layout from interface data? Node positions will reset but steps will be preserved.')) return
    const iface = api.interfaces.find(i => i.id === selId)
    if (!iface) return

    // Preserve steps from current nodes, keyed by nodeKey
    const stepsMap = new Map<string, NonNullable<FlowNode['steps']>>()
    for (const node of (state?.nodes ?? [])) {
      if (node.nodeKey && node.steps?.length) stepsMap.set(node.nodeKey, node.steps)
    }

    const fresh = buildInterfaceState(iface, api.systems)
    if (stepsMap.size > 0) {
      fresh.nodes = fresh.nodes.map(n => {
        const steps = n.nodeKey ? stepsMap.get(n.nodeKey) : undefined
        return steps?.length ? { ...n, steps } : n
      })
    }
    setState(fresh)
  }

  const grouped   = api.logicalGroups.map(g => ({ group: g, ifaces: api.interfaces.filter(i => i.logical_group_id === g.id) }))
  const ungrouped = api.interfaces.filter(i => !i.logical_group_id)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left panel */}
      <div style={{
        width: panelCollapsed ? 28 : 230, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRight: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_ContentBackground)',
        transition: 'width 0.15s ease',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: panelCollapsed ? '7px 4px' : '7px 8px 7px 12px', flexShrink: 0,
          borderBottom: '1px solid var(--sapList_BorderColor)',
          background: 'var(--sapGroup_TitleBackground)',
        }}>
          {!panelCollapsed && (
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>
              Flow Diagrams
            </span>
          )}
          <button
            onClick={() => setPanelCollapsed(c => !c)}
            title={panelCollapsed ? 'Expand panel' : 'Collapse panel'}
            style={{
              width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem', borderRadius: 3,
              flexShrink: 0,
            }}
          >
            {panelCollapsed ? '›' : '‹'}
          </button>
        </div>

        {!panelCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {api.loading && (
              <div style={{ padding: 12, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                Loading…
              </div>
            )}

            {grouped.map(({ group, ifaces }) => (
              <div key={group.id}>
                <GroupLabel label={group.name} />
                {ifaces.map(iface => (
                  <PanelItem
                    key={iface.id}
                    label={iface.name}
                    badge={iface.ref}
                    depth={1}
                    selected={selId === iface.id}
                    onClick={() => select(iface.id)}
                  />
                ))}
              </div>
            ))}

            {ungrouped.length > 0 && (
              <>
                {grouped.length > 0 && (
                  <div style={{ padding: '6px 12px 2px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Ungrouped
                  </div>
                )}
                {ungrouped.map(iface => (
                  <PanelItem
                    key={iface.id}
                    label={iface.name}
                    badge={iface.ref}
                    depth={0}
                    selected={selId === iface.id}
                    onClick={() => select(iface.id)}
                  />
                ))}
              </>
            )}

            {!api.loading && api.interfaces.length === 0 && (
              <div style={{ padding: 12, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                No interfaces yet. Create them in the Registry tab.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
            Select an interface to open its flow diagram.
          </div>
        ) : loadErr ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c0392b', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem' }}>
            {loadErr}
          </div>
        ) : (
          <FlowCanvas
            key={selId}
            initialState={state}
            onSave={save}
            onReseed={reseed}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}
