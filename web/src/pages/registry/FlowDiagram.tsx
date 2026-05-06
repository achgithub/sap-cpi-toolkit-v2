import { useEffect, useState } from 'react'
import { useRegistryApi } from './useRegistryApi'
import type { Interface, System, LogicalGroup } from './types'
import FlowCanvas, { type FlowDiagramState, type FlowNode, type FlowEdge, FLOW_DEFAULTS, flowUid, nodeCenter } from './FlowCanvas'

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
  const stepW = FLOW_DEFAULTS.step.w
  const stepH = FLOW_DEFAULTS.step.h
  const gap = 50

  let x = 60
  const topY = 40

  // Sender system box
  const senderSys = systems.find(s => s.id === iface.sender_system_id)
  const senderNode: FlowNode = {
    id: flowUid(), type: 'system',
    label: senderSys?.name ?? 'Sender',
    x, y: topY, width: sysW, height: sysH,
    color: FLOW_DEFAULTS.system.color, fontSize: FLOW_DEFAULTS.system.fs,
  }
  nodes.push(senderNode)

  if (iface.sender_step_label) {
    nodes.push({
      id: flowUid(), type: 'step', label: iface.sender_step_label,
      x: x + 20, y: topY + 50, width: stepW, height: stepH,
      color: FLOW_DEFAULTS.step.color, fontSize: FLOW_DEFAULTS.step.fs,
    })
  }

  x += sysW + gap

  // Shared via hops
  let prevId = senderNode.id
  let prevCenter = nodeCenter(senderNode)

  for (const hop of iface.via) {
    const hopNode: FlowNode = {
      id: flowUid(), type: 'hop', label: hop.label,
      x, y: snapV(topY + (sysH - hopH) / 2), width: hopW, height: hopH,
      color: FLOW_DEFAULTS.hop.color, fontSize: FLOW_DEFAULTS.hop.fs,
    }
    nodes.push(hopNode)
    const hc = nodeCenter(hopNode)
    edges.push({ id: flowUid(), fromNodeId: prevId, toNodeId: hopNode.id, path: [prevCenter, hc], label: '', arrow: 'end' })
    prevId = hopNode.id
    prevCenter = hc
    x += hopW + gap
  }

  // Receivers (stacked vertically if multiple)
  let recvY = topY
  for (const recv of iface.receivers) {
    const recvSys = systems.find(s => s.id === recv.system_id)

    // Per-receiver via hops (branch off from shared end)
    let branchId = prevId
    let branchCenter = prevCenter
    let branchX = x

    for (const hop of recv.via) {
      const hopNode: FlowNode = {
        id: flowUid(), type: 'hop', label: hop.label,
        x: branchX, y: snapV(recvY + (sysH - hopH * 0.7) / 2), width: hopW, height: Math.round(hopH * 0.7),
        color: FLOW_DEFAULTS.hop.color, fontSize: FLOW_DEFAULTS.hop.fs,
      }
      nodes.push(hopNode)
      const hc = nodeCenter(hopNode)
      edges.push({ id: flowUid(), fromNodeId: branchId, toNodeId: hopNode.id, path: [branchCenter, hc], label: '', arrow: 'end' })
      branchId = hopNode.id
      branchCenter = hc
      branchX += hopW + gap
    }

    const recvNode: FlowNode = {
      id: flowUid(), type: 'system',
      label: recvSys?.name ?? 'Receiver',
      x: branchX, y: recvY, width: sysW, height: sysH,
      color: FLOW_DEFAULTS.system.color, fontSize: FLOW_DEFAULTS.system.fs,
    }
    nodes.push(recvNode)

    if (iface.receiver_step_label) {
      nodes.push({
        id: flowUid(), type: 'step', label: iface.receiver_step_label,
        x: branchX + 20, y: recvY + 50, width: stepW, height: stepH,
        color: FLOW_DEFAULTS.step.color, fontSize: FLOW_DEFAULTS.step.fs,
      })
    }

    const rc = nodeCenter(recvNode)
    edges.push({ id: flowUid(), fromNodeId: branchId, toNodeId: recvNode.id, path: [branchCenter, rc], label: '', arrow: 'end' })

    recvY += sysH + gap
  }

  // If no receivers, just leave sender + hops
  return { nodes, edges }
}

function buildGroupState(group: LogicalGroup, interfaces: Interface[], systems: System[]): FlowDiagramState {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  let yOffset = 60

  const groupIfaces = interfaces.filter(i => i.logical_group_id === group.id)
  for (const iface of groupIfaces) {
    const sub = buildInterfaceState(iface, systems)
    const maxY = sub.nodes.filter(n => n.type !== 'boundary').reduce((m, n) => Math.max(m, n.y + n.height), 0)

    sub.nodes.forEach(n => nodes.push({ ...n, y: n.type === 'boundary' ? n.y : n.y + yOffset }))
    sub.edges.forEach(e => edges.push({ ...e, path: e.path.map(p => ({ x: p.x, y: p.y + yOffset })) }))

    yOffset += maxY + 80
  }

  return { nodes, edges }
}

// ── Left panel item ───────────────────────────────────────────────────────────

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

type Selection = { kind: 'iface' | 'group'; id: string }

export default function FlowDiagram() {
  const api = useRegistryApi()
  const [sel, setSel] = useState<Selection | null>(null)
  const [state, setState] = useState<FlowDiagramState | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [panelCollapsed, setPanelCollapsed] = useState(false)

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function select(s: Selection) {
    setSel(s)
    setLoadErr('')
    setState(null)
    try {
      const url = s.kind === 'iface'
        ? `${BASE}/interfaces/${s.id}/flow-diagram`
        : `${BASE}/logical-groups/${s.id}/flow-diagram`
      const res = await fetch(url)
      const data = await res.json()

      if (data && Array.isArray(data.nodes)) {
        setState(data as FlowDiagramState)
      } else {
        // Auto-generate initial layout
        if (s.kind === 'iface') {
          const iface = api.interfaces.find(i => i.id === s.id)
          if (iface) setState(buildInterfaceState(iface, api.systems))
        } else {
          const group = api.logicalGroups.find(g => g.id === s.id)
          if (group) setState(buildGroupState(group, api.interfaces, api.systems))
        }
      }
    } catch {
      setLoadErr('Failed to load diagram state')
    }
  }

  async function save(newState: FlowDiagramState) {
    if (!sel) return
    setSaving(true)
    try {
      const url = sel.kind === 'iface'
        ? `${BASE}/interfaces/${sel.id}/flow-diagram`
        : `${BASE}/logical-groups/${sel.id}/flow-diagram`
      await fetch(url, {
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
    if (!sel) return
    if (!window.confirm('Regenerate layout from interface data? This will discard your current diagram.')) return
    if (sel.kind === 'iface') {
      const iface = api.interfaces.find(i => i.id === sel.id)
      if (iface) setState(buildInterfaceState(iface, api.systems))
    } else {
      const group = api.logicalGroups.find(g => g.id === sel.id)
      if (group) setState(buildGroupState(group, api.interfaces, api.systems))
    }
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
        {/* Panel header with collapse toggle */}
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
                <PanelItem
                  label={group.name}
                  depth={0}
                  selected={sel?.kind === 'group' && sel.id === group.id}
                  onClick={() => select({ kind: 'group', id: group.id })}
                />
                {ifaces.map(iface => (
                  <PanelItem
                    key={iface.id}
                    label={iface.name}
                    badge={iface.ref}
                    depth={1}
                    selected={sel?.kind === 'iface' && sel.id === iface.id}
                    onClick={() => select({ kind: 'iface', id: iface.id })}
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
                    selected={sel?.kind === 'iface' && sel.id === iface.id}
                    onClick={() => select({ kind: 'iface', id: iface.id })}
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
        {!sel ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
            Select an interface or logical group to open its flow diagram.
          </div>
        ) : loadErr ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c0392b', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem' }}>
            {loadErr}
          </div>
        ) : (
          <FlowCanvas
            key={sel.kind + sel.id}
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
