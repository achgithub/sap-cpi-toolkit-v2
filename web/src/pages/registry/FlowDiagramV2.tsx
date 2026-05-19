import { useEffect, useState } from 'react'
import { useRegistryApiV2 } from './useRegistryApiV2'
import type { InterfaceV2 } from './types_v2'
import { TRIGGER_LABELS, PATTERN_LABELS } from './types_v2'
import FlowCanvas, {
  type FlowDiagramState, type FlowNode,
  FLOW_DEFAULTS, flowUid,
} from './FlowCanvas'

const BASE_V2 = '/api/interfaces/v2'

// ── Seed builder ──────────────────────────────────────────────────────────────
// Layout rules:
//   Business systems ALWAYS on the left and right.
//   Integration components ALWAYS in the middle.
//   For scheduled/event: source system left ←trigger→ component middle → receiver right
//   API callouts float ABOVE their component hop — main flow line stays clean.
//   Architecture view (future): skip all components, draw system→system only.

function snap(v: number) { return Math.round(v / 10) * 10 }

// FlowEdge is not exported from FlowCanvas so derive it from the state type
type FlowEdge = FlowDiagramState['edges'][number]

const CALLOUT_W = 180
const CALLOUT_H = FLOW_DEFAULTS.step.h  // 44
const CALLOUT_GAP = 12

function buildV2State(
  iface:      InterfaceV2,
  systems:    { id: string; name: string }[],
  components: { id: string; name: string }[],
): FlowDiagramState {
  const nodes: FlowNode[]  = []
  const edges: FlowEdge[]  = []

  const sysW = FLOW_DEFAULTS.system.w
  const sysH = FLOW_DEFAULTS.system.h
  const hopW = FLOW_DEFAULTS.hop.w
  const hopH = FLOW_DEFAULTS.hop.h
  const gap  = 80

  // Leave headroom above for callout boxes — calculate max callouts in shared via
  const maxCallouts = Math.max(0, ...iface.via.map(h => (h.callouts ?? []).length))
  const calloutHeadroom = maxCallouts > 0 ? maxCallouts * (CALLOUT_H + CALLOUT_GAP) + CALLOUT_GAP + 30 : 0

  const topY = 60 + calloutHeadroom   // main flow row sits below callout space
  let x = 60

  const rc = (n: FlowNode) => ({ x: n.x + n.width,  y: n.y + n.height / 2 })
  const lc = (n: FlowNode) => ({ x: n.x,             y: n.y + n.height / 2 })
  const tc = (n: FlowNode) => ({ x: n.x + n.width / 2, y: n.y })

  // ── Left business system ─────────────────────────────────────────────────────
  // Always a business system on the left regardless of trigger type.
  // For system_push/api_inbound: that's the trigger system.
  // For component_scheduled/event: that's the source system (what the component fetches from).

  const leftSysId = (iface.trigger_type === 'component_scheduled' || iface.trigger_type === 'component_event')
    ? iface.source_system_id
    : iface.trigger_system_id

  const leftSys = systems.find(s => s.id === leftSysId)
  const leftNode: FlowNode = {
    id: flowUid(), type: 'system',
    label: leftSys?.name ?? (iface.trigger_type === 'api_inbound' ? 'API Caller' : 'Source / Sender'),
    x, y: topY, width: sysW, height: sysH,
    color: FLOW_DEFAULTS.system.color, fontSize: FLOW_DEFAULTS.system.fs,
    nodeKey: 'left-system',
  }
  nodes.push(leftNode)
  x += sysW + gap

  let prevNode: FlowNode = leftNode

  // ── Trigger component (scheduled/event only) ─────────────────────────────────
  // For scheduled/event, the trigger component sits immediately right of the source system.
  // Edge from source system to trigger component is bidirectional — "trigger" going left,
  // data returning right.

  if (iface.trigger_type === 'component_scheduled' || iface.trigger_type === 'component_event') {
    const comp = components.find(c => c.id === iface.trigger_component_id)
    const trigNode: FlowNode = {
      id: flowUid(), type: 'hop',
      label: comp?.name ?? 'Trigger Component',
      x, y: snap(topY + (sysH - hopH) / 2), width: hopW, height: hopH,
      color: FLOW_DEFAULTS.hop.color, fontSize: FLOW_DEFAULTS.hop.fs,
      nodeKey: 'trigger-component',
    }
    nodes.push(trigNode)

    // Two parallel arrows between source system and trigger component:
    // 1. Dashed blue: CPI → source (the poll/trigger request), offset upward
    // 2. Solid async:  source → CPI (data flows back), offset downward
    const OFF = 10
    const trigLabel = iface.schedule_expression ?? (iface.trigger_type === 'component_event' ? 'event' : '')
    edges.push({
      id: flowUid(),
      fromNodeId: trigNode.id, toNodeId: leftNode.id,
      path: [
        { x: lc(trigNode).x, y: lc(trigNode).y - OFF },
        { x: rc(leftNode).x, y: rc(leftNode).y - OFF },
      ],
      label: trigLabel,
      arrow: 'end',
      dashed: true,
      color: '#1565C0',
    })
    edges.push({
      id: flowUid(),
      fromNodeId: leftNode.id, toNodeId: trigNode.id,
      path: [
        { x: rc(leftNode).x, y: rc(leftNode).y + OFF },
        { x: lc(trigNode).x, y: lc(trigNode).y + OFF },
      ],
      label: '',
      arrow: 'end',
    })
    prevNode = trigNode
    x += hopW + gap
  }

  // ── Shared via hops ─────────────────────────────────────────────────────────
  for (let vi = 0; vi < iface.via.length; vi++) {
    const hop = iface.via[vi]
    const callouts = hop.callouts ?? []

    const hopY = snap(topY + (sysH - hopH) / 2)
    const hopNode: FlowNode = {
      id: flowUid(), type: 'hop',
      label: hop.label,
      x, y: hopY, width: hopW, height: hopH,
      color: FLOW_DEFAULTS.hop.color, fontSize: FLOW_DEFAULTS.hop.fs,
      nodeKey: `via-${vi}`,
    }
    nodes.push(hopNode)

    // For system_scheduled: first edge carries the schedule expression as a label
    const hopLabel = (vi === 0 && iface.trigger_type === 'system_scheduled')
      ? (iface.schedule_expression ?? '') : ''
    edges.push({
      id: flowUid(),
      fromNodeId: prevNode.id, toNodeId: hopNode.id,
      path: [rc(prevNode), lc(hopNode)],
      label: hopLabel,
      arrow: iface.interaction_pattern === 'sync' ? 'both' : 'end',
    })

    // ── Callout boxes float above this hop ─────────────────────────────────────
    // Stacked upward: first callout is closest to the hop, subsequent ones higher.
    const hopCentreX = hopNode.x + (hopW - CALLOUT_W) / 2
    callouts.forEach((c, ci) => {
      const calloutY = hopY - (ci + 1) * (CALLOUT_H + CALLOUT_GAP)
      const calloutNode: FlowNode = {
        id: flowUid(), type: 'step',
        label: c.label + (c.system_label ? `\n→ ${c.system_label}` : ''),
        x: hopCentreX, y: calloutY,
        width: CALLOUT_W, height: CALLOUT_H,
        color: FLOW_DEFAULTS.step.color, fontSize: FLOW_DEFAULTS.step.fs,
        nodeKey: `via-${vi}-callout-${ci}`,
      }
      nodes.push(calloutNode)
      // Vertical edge from hop up to callout
      edges.push({
        id: flowUid(),
        fromNodeId: hopNode.id, toNodeId: calloutNode.id,
        path: [tc(hopNode), { x: tc(hopNode).x, y: calloutY + CALLOUT_H }],
        label: '',
        arrow: 'none',
      })
    })

    prevNode = hopNode
    x += hopW + gap
  }

  // ── Receivers (right-side business systems) ──────────────────────────────────
  // Add pattern label on first receiver edge if there were no via hops
  let recvY = topY
  for (let ri = 0; ri < iface.receivers.length; ri++) {
    const recv = iface.receivers[ri]
    let branchNode = prevNode
    let branchX = x

    // Per-receiver via hops (extra components before this specific receiver)
    for (let hi = 0; hi < recv.via.length; hi++) {
      const hop = recv.via[hi]
      const hopNode: FlowNode = {
        id: flowUid(), type: 'hop', label: hop.label,
        x: branchX, y: snap(recvY + (sysH - hopH) / 2), width: hopW, height: hopH,
        color: FLOW_DEFAULTS.hop.color, fontSize: FLOW_DEFAULTS.hop.fs,
        nodeKey: `recv-${ri}-via-${hi}`,
      }
      nodes.push(hopNode)
      edges.push({ id: flowUid(), fromNodeId: branchNode.id, toNodeId: hopNode.id, path: [rc(branchNode), lc(hopNode)], label: '', arrow: 'end' })
      branchNode = hopNode
      branchX += hopW + gap
    }

    const recvSys = systems.find(s => s.id === recv.system_id)
    const recvNode: FlowNode = {
      id: flowUid(), type: 'system',
      label: recvSys?.name ?? 'Receiver',
      x: branchX, y: recvY, width: sysW, height: sysH,
      color: FLOW_DEFAULTS.system.color, fontSize: FLOW_DEFAULTS.system.fs,
      nodeKey: `recv-${ri}`,
    }
    nodes.push(recvNode)
    const recvLabel = (iface.via.length === 0 && ri === 0 && iface.trigger_type === 'system_scheduled')
      ? (iface.schedule_expression ?? '') : ''
    edges.push({
      id: flowUid(),
      fromNodeId: branchNode.id, toNodeId: recvNode.id,
      path: [rc(branchNode), lc(recvNode)],
      label: recvLabel,
      arrow: iface.interaction_pattern === 'sync' ? 'both' : 'end',
    })

    recvY += sysH + gap
  }

  return { nodes, edges }
}

// ── Panel items ───────────────────────────────────────────────────────────────

function PanelItem({ label, badge, selected, onClick }: {
  label: string; badge?: string; selected: boolean; onClick: () => void
}) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', cursor: 'pointer',
      background: selected ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
      borderLeft: selected ? '2px solid var(--sapHighlightColor)' : '2px solid transparent',
      fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)',
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--sapContent_LabelColor)',
          background: 'var(--sapGroup_TitleBackground)', border: '1px solid var(--sapList_BorderColor)',
          borderRadius: 3, padding: '0 3px', flexShrink: 0,
        }}>{badge.trim()}</span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FlowDiagramV2() {
  const api = useRegistryApiV2()
  const [selId,          setSelId]          = useState<string | null>(null)
  const [state,          setState]          = useState<FlowDiagramState | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [loadErr,        setLoadErr]        = useState('')
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [search,         setSearch]         = useState('')

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = api.interfaces.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.ref.toLowerCase().includes(search.toLowerCase())
  )

  async function select(id: string) {
    setSelId(id); setLoadErr(''); setState(null)
    try {
      const res = await fetch(`${BASE_V2}/interfaces/${id}/flow-diagram`)
      const data = await res.json()
      if (data && Array.isArray(data.nodes) && data.nodes.length > 0) {
        setState(data as FlowDiagramState)
      } else {
        const iface = api.interfaces.find(i => i.id === id)
        if (iface) setState(buildV2State(iface, api.systems, api.components))
      }
    } catch { setLoadErr('Failed to load diagram') }
  }

  async function save(newState: FlowDiagramState) {
    if (!selId) return
    setSaving(true)
    try {
      await fetch(`${BASE_V2}/interfaces/${selId}/flow-diagram`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState),
      })
      setState(newState)
    } finally { setSaving(false) }
  }

  function reseed() {
    if (!selId) return
    if (!window.confirm('Regenerate layout from interface data? Node positions will reset but steps will be preserved.')) return
    const iface = api.interfaces.find(i => i.id === selId)
    if (!iface) return
    // Preserve steps keyed by "nodeKey:label" — compound key distinguishes multiple
    // instances of the same system/platform appearing in the same diagram
    const stepsMap = new Map<string, NonNullable<FlowNode['steps']>>()
    for (const node of (state?.nodes ?? [])) {
      if (node.nodeKey && node.steps?.length)
        stepsMap.set(`${node.nodeKey}:${node.label}`, node.steps)
    }
    const fresh = buildV2State(iface, api.systems, api.components)
    if (stepsMap.size > 0) {
      fresh.nodes = fresh.nodes.map(n => {
        const steps = n.nodeKey ? stepsMap.get(`${n.nodeKey}:${n.label}`) : undefined
        return steps?.length ? { ...n, steps } : n
      })
    }
    setState(fresh)
  }

  const selectedIface = selId ? api.interfaces.find(i => i.id === selId) : null

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left panel */}
      <div style={{
        width: panelCollapsed ? 28 : 240, flexShrink: 0,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRight: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_ContentBackground)',
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
              Flow Diagrams V2
            </span>
          )}
          <button onClick={() => setPanelCollapsed(c => !c)} style={{
            width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem', borderRadius: 3, flexShrink: 0,
          }}>
            {panelCollapsed ? '›' : '‹'}
          </button>
        </div>

        {!panelCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Search */}
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--sapList_BorderColor)', flexShrink: 0 }}>
              <input
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
                  border: '1px solid var(--sapList_BorderColor)', borderRadius: 4, padding: '4px 6px',
                  background: 'var(--sapField_Background)', color: 'var(--sapTextColor)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {api.loading && (
              <div style={{ padding: 12, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                Loading…
              </div>
            )}

            {filtered.map(iface => (
              <PanelItem
                key={iface.id}
                label={iface.name}
                badge={iface.ref}
                selected={selId === iface.id}
                onClick={() => select(iface.id)}
              />
            ))}

            {!api.loading && filtered.length === 0 && (
              <div style={{ padding: 12, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                {api.interfaces.length === 0 ? 'No interfaces in V2 registry yet.' : 'No interfaces match.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Selected interface info bar */}
        {selectedIface && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px', flexShrink: 0,
            borderBottom: '1px solid var(--sapList_BorderColor)',
            background: 'var(--sapGroup_TitleBackground)',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
          }}>
            <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>{selectedIface.ref}</code>
            <span style={{ color: 'var(--sapTextColor)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedIface.name}</span>
            <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.72rem' }}>{TRIGGER_LABELS[selectedIface.trigger_type]}</span>
            <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.72rem' }}>{PATTERN_LABELS[selectedIface.interaction_pattern]}</span>
          </div>
        )}

        {!selId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
            Select an interface to open its flow diagram.
          </div>
        ) : loadErr ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sapNegativeColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem' }}>
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
