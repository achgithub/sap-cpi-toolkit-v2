import { useEffect, useRef, useState } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import type Cytoscape from 'cytoscape'
import type { Interface, System, LogicalGroup, RegistryConfig } from './types'
import { getSystemColor } from './types'
import { useRegistryApi } from './useRegistryApi'

const BASE = '/api/interfaces'
const NODE_W = 160
const NODE_H = 100

// ── Data builder ──────────────────────────────────────────────────────────────

interface CyElement {
  data: Record<string, unknown>
  position?: { x: number; y: number }
  classes?: string
}

function buildElements(
  groupId: string,
  interfaces: Interface[],
  systems: System[],
  config: RegistryConfig,
  savedPositions: Record<string, { x: number; y: number }>,
): CyElement[] {
  const groupIfaces = interfaces
    .filter(i => i.logical_group_id === groupId)
    .sort((a, b) => (a.sequence_in_group ?? 999) - (b.sequence_in_group ?? 999))

  const nodeMap = new Map<string, { id: string; label: string; color: string }>()
  const elements: CyElement[] = []

  function ensureNode(sysId: string) {
    if (nodeMap.has(sysId)) return
    const sys = systems.find(s => s.id === sysId)
    nodeMap.set(sysId, {
      id: sysId,
      label: sys?.name ?? sysId,
      color: getSystemColor(sys?.system_type ?? '', config),
    })
  }

  // Collect all unique nodes
  for (const iface of groupIfaces) {
    if (iface.sender_system_id) ensureNode(iface.sender_system_id)
    for (const r of iface.receivers) {
      if (r.system_id) ensureNode(r.system_id)
    }
    for (const hop of iface.via) {
      if (hop.system_id) ensureNode(hop.system_id)
    }
  }

  // Node elements
  for (const [id, n] of nodeMap) {
    const saved = savedPositions[id]
    elements.push({
      data: { id: n.id, label: n.label, color: n.color },
      ...(saved ? { position: saved } : {}),
    })
  }

  // Edge elements — one per interface leg (sender → each receiver)
  for (const iface of groupIfaces) {
    if (!iface.sender_system_id) continue
    const ref   = iface.ref?.trim() || iface.name
    const color = STATUS_EDGE_COLOR[iface.status] ?? '#888'

    if (iface.receivers.length === 0) continue

    for (const recv of iface.receivers) {
      if (!recv.system_id) continue
      // If there are shared via hops, route sender→via→receiver
      // Cytoscape doesn't do waypoints natively, so we draw sender→last-via→receiver
      const lastVia = iface.via.length > 0
        ? iface.via[iface.via.length - 1].system_id ?? iface.sender_system_id
        : iface.sender_system_id
      const source = lastVia ?? iface.sender_system_id
      elements.push({
        data: {
          id: `e-${iface.id}-${recv.id}`,
          source,
          target: recv.system_id,
          ref,
          color,
          ifaceId: iface.id,
        },
      })
    }
  }

  return elements
}

const STATUS_EDGE_COLOR: Record<string, string> = {
  active:     '#1B5E20',
  test:       '#0277BD',
  dev:        '#E65100',
  design:     '#888',
  deprecated: '#B71C1C',
}

// ── Cytoscape stylesheet ──────────────────────────────────────────────────────

const stylesheet: Cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      width:  NODE_W,
      height: NODE_H,
      shape:  'rectangle',
      'background-color':   'data(color)',
      'border-width':       2,
      'border-color':       'data(color)',
      'border-opacity':     1,
      label:                'data(label)',
      'text-valign':        'center',
      'text-halign':        'center',
      'text-wrap':          'ellipsis',
      'text-max-width':     '140px',
      color:                '#fff',
      'font-size':          13,
      'font-weight':        'bold',
      'font-family':        'var(--sapFontFamily, sans-serif)',
    } as Cytoscape.NodeSingularStyleProperties,
  },
  {
    selector: 'edge',
    style: {
      width:               1.5,
      'line-color':        'data(color)',
      'target-arrow-color':'data(color)',
      'target-arrow-shape':'triangle',
      'arrow-scale':       0.8,
      'curve-style':       'unbundled-bezier',
      'control-point-step-size': 30,
      label:               'data(ref)',
      'font-size':         9,
      'font-family':       'var(--sapFontFamily, sans-serif)',
      color:               '#333',
      'text-background-color':   '#fff',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
      'text-background-shape':   'roundrectangle',
      'text-border-width':       0,
    } as Cytoscape.EdgeSingularStyleProperties,
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#0070F2',
      'border-width':  3,
    } as Cytoscape.NodeSingularStyleProperties,
  },
]

// ── Layout ────────────────────────────────────────────────────────────────────

function makeLayout(hasSavedPositions: boolean): Cytoscape.LayoutOptions {
  if (hasSavedPositions) {
    return { name: 'preset' } as Cytoscape.LayoutOptions
  }
  return {
    name: 'concentric',
    concentric:  (node: Cytoscape.NodeSingular) => node.degree(false),
    levelWidth:  () => 2,
    minNodeSpacing: 60,
    spacingFactor:  1.4,
    padding: 60,
    animate: false,
  } as Cytoscape.LayoutOptions
}

// ── Left panel ────────────────────────────────────────────────────────────────

function GroupList({ groups, selectedId, onSelect }: {
  groups: LogicalGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {groups.length === 0 && (
        <div style={{ padding: 12, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
          No logical groups yet.
        </div>
      )}
      {groups.map(g => (
        <div
          key={g.id}
          onClick={() => onSelect(g.id)}
          style={{
            padding: '6px 12px', cursor: 'pointer',
            background: selectedId === g.id ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
            borderLeft: selectedId === g.id ? '2px solid #0070F2' : '2px solid transparent',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
            fontWeight: 'bold', color: 'var(--sapTextColor)',
          }}
        >
          {g.name}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GroupDiagramCyto() {
  const api = useRegistryApi()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [savedPositions,  setSavedPositions]  = useState<Record<string, { x: number; y: number }>>({})
  const [panelCollapsed,  setPanelCollapsed]  = useState(false)
  const [showRefs,        setShowRefs]        = useState(true)
  const cyRef = useRef<Cytoscape.Core | null>(null)

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved positions when group changes
  useEffect(() => {
    if (!selectedGroupId) return
    setSavedPositions({})
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

  // Save positions after drag
  function savePositions() {
    const cy = cyRef.current
    if (!cy || !selectedGroupId) return
    const nodes = cy.nodes().map(n => ({ id: n.id(), x: n.position('x'), y: n.position('y') }))
    fetch(`${BASE}/logical-groups/${selectedGroupId}/flow-diagram`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupViz: { nodes } }),
    }).catch(() => {})
  }

  const elements = selectedGroupId
    ? buildElements(selectedGroupId, api.interfaces, api.systems, api.config, savedPositions)
    : []

  const hasSaved = Object.keys(savedPositions).length > 0

  // Toggle edge label visibility
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.edges().style('font-size', showRefs ? 9 : 0)
    cy.edges().style('text-background-opacity', showRefs ? 0.85 : 0)
  }, [showRefs])

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
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>
              Groups
            </span>
          )}
          <button onClick={() => setPanelCollapsed(c => !c)}
            style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem', borderRadius: 3, flexShrink: 0 }}>
            {panelCollapsed ? '›' : '‹'}
          </button>
        </div>
        {!panelCollapsed && (
          <GroupList
            groups={api.logicalGroups}
            selectedId={selectedGroupId}
            onSelect={setSelectedGroupId}
          />
        )}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {!selectedGroupId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
            Select a group to view its diagram.
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 20, display: 'flex', gap: 6 }}>
              <button style={toolBtn} onClick={() => cyRef.current?.fit(undefined, 40)}>⤢ Fit</button>
              <button
                style={{ ...toolBtn, background: showRefs ? '#0070F2' : 'var(--sapTile_Background)', color: showRefs ? 'white' : 'var(--sapTextColor)', borderColor: showRefs ? '#0070F2' : 'var(--sapList_BorderColor)' }}
                onClick={() => setShowRefs(v => !v)}
              >
                {showRefs ? 'Refs' : 'Count'}
              </button>
              <button style={toolBtn} onClick={() => {
                setSavedPositions({})
                const cy = cyRef.current
                if (!cy) return
                cy.layout(makeLayout(false)).run()
              }}>↺ Reset layout</button>
            </div>

            <CytoscapeComponent
              key={`${selectedGroupId}-${hasSaved}`}
              elements={elements}
              stylesheet={stylesheet}
              layout={makeLayout(hasSaved)}
              cy={cy => {
                cyRef.current = cy
                cy.on('dragfreeon', 'node', savePositions)
              }}
              style={{ flex: 1, width: '100%', height: '100%', background: 'var(--sapBackgroundColor)' }}
            />
          </>
        )}
      </div>
    </div>
  )
}
