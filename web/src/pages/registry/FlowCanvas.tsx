import { useEffect, useRef, useState } from 'react'
import { Button } from '@ui5/webcomponents-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type FlowNodeType = 'system' | 'hop' | 'step' | 'text' | 'boundary'

export interface FlowStep {
  id: string
  num: number
  text: string
  notes: string
  ifaceRef?: string
  ifaceColor?: string
}

export const STEP_ROW_H = 26

export interface FlowNode {
  id: string
  type: FlowNodeType
  label: string
  x: number
  y: number
  width: number
  height: number
  color: string
  fontSize: number
  steps?: FlowStep[]
  nodeKey?: string
}

export interface FlowEdge {
  id: string
  fromNodeId: string | null
  toNodeId: string | null
  path: { x: number; y: number }[]   // full path: [start, ...waypoints, end]
  label: string
  arrow: 'end' | 'none' | 'both'
}

export interface FlowDiagramState {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID = 10

export const FLOW_DEFAULTS: Record<FlowNodeType, { w: number; h: number; color: string; fs: number }> = {
  system:   { w: 160, h: 100, color: '#1565C0', fs: 13 },
  hop:      { w: 160, h: 100, color: '#E65100', fs: 13 },
  step:     { w: 160, h: 44,  color: '#880E4F', fs: 12 },
  text:     { w: 120, h: 28,  color: '#222222', fs: 14 },
  boundary: { w: 2,   h: 800, color: '#777777', fs: 12 },
}

const PRESET_COLORS = [
  '#1565C0', '#0277BD', '#1B5E20', '#E65100',
  '#880E4F', '#4527A0', '#37474F', '#C62828',
  '#00695C', '#6D4C41', '#F57F17', '#4A148C',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0
export function flowUid() { return `fc${++_seq}` }

function snap(v: number) { return Math.round(v / GRID) * GRID }

export function nodeCenter(n: FlowNode) {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
}

function hitTest(n: FlowNode, pt: { x: number; y: number }): boolean {
  if (n.type === 'boundary') return Math.abs(pt.x - n.x) <= 10
  return pt.x >= n.x && pt.x <= n.x + n.width && pt.y >= n.y && pt.y <= n.y + n.height
}

// ── Drag state ────────────────────────────────────────────────────────────────

type Tool = 'select' | 'system' | 'hop' | 'step' | 'text' | 'boundary' | 'line'
type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

type DragState =
  | { kind: 'pan';      ox: number; oy: number; sx: number; sy: number }
  | { kind: 'node';     id: string; ox: number; oy: number; sx: number; sy: number; nw: number; nh: number; isBoundary: boolean }
  | { kind: 'resize';   id: string; ox: number; oy: number; ow: number; oh: number; sx: number; sy: number; dir: ResizeDir }
  | { kind: 'waypoint'; eid: string; idx: number; sx: number; sy: number }
  | { kind: 'drawline'; fromId: string }

const RESIZE_DIRS: ResizeDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const DIR_STYLE: Record<ResizeDir, React.CSSProperties> = {
  nw: { top: -4, left: -4, cursor: 'nw-resize' },
  n:  { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
  ne: { top: -4, right: -4, cursor: 'ne-resize' },
  e:  { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'e-resize' },
  se: { bottom: -4, right: -4, cursor: 'se-resize' },
  s:  { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
  sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
  w:  { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'w-resize' },
}

// ── NodeBox ───────────────────────────────────────────────────────────────────

const ACCENT_H  = 6   // colored top bar (matches Architecture tab)
const LABEL_H   = 30  // system name row
const ADD_STEP_H = 24

interface NodeBoxProps {
  node: FlowNode
  selected: boolean
  editing: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onLabelSave: (label: string) => void
  onResizeMouseDown: (e: React.MouseEvent, dir: ResizeDir) => void
  onStepsChange: (steps: FlowStep[]) => void
}

function NodeBox({ node, selected, editing, onMouseDown, onDoubleClick, onLabelSave, onResizeMouseDown, onStepsChange }: NodeBoxProps) {
  const [draft, setDraft] = useState(node.label)
  const [editingStep, setEditingStep] = useState<string | null>(null)
  const [stepDraft, setStepDraft] = useState('')
  useEffect(() => { setDraft(node.label) }, [node.label])

  // ── Boundary (vertical dashed line) ──────────────────────────────────────

  if (node.type === 'boundary') {
    return (
      <div style={{ position: 'absolute', left: node.x - 1, top: 0, width: 2, height: 3000, pointerEvents: 'none' }}>
        {/* Wide invisible hit area */}
        <div
          style={{ position: 'absolute', left: -9, top: 0, width: 20, height: '100%', cursor: 'ew-resize', pointerEvents: 'all' }}
          onMouseDown={onMouseDown}
        />
        {/* Visible line */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 2, height: '100%', borderLeft: `2px dashed ${node.color}` }} />
        {/* Label below */}
        <div
          style={{
            position: 'absolute', bottom: -32, left: '50%', transform: 'translateX(-50%)',
            whiteSpace: 'nowrap', fontFamily: 'var(--sapFontFamily)', fontSize: node.fontSize,
            color: node.color, fontWeight: 'bold', pointerEvents: 'all', cursor: 'default',
          }}
          onDoubleClick={onDoubleClick}
        >
          {editing
            ? <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                onBlur={() => onLabelSave(draft)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onLabelSave(draft) } }}
                style={{ fontSize: node.fontSize, color: node.color, border: 'none', background: 'transparent', outline: '1px solid #0070F2', fontFamily: 'var(--sapFontFamily)', fontWeight: 'bold' }} />
            : node.label
          }
        </div>
        {selected && (
          <div style={{ position: 'absolute', top: 20, left: -4, width: 10, height: 10, background: 'white', border: '2px solid #0070F2', borderRadius: 2, pointerEvents: 'none' }} />
        )}
      </div>
    )
  }

  // ── Text label (no background) ────────────────────────────────────────────

  if (node.type === 'text') {
    return (
      <div
        style={{
          position: 'absolute', left: node.x, top: node.y,
          cursor: 'move', userSelect: 'none',
          outline: selected ? '1px dashed #0070F2' : 'none',
          padding: '2px 4px',
        }}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
      >
        {editing
          ? <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onBlur={() => onLabelSave(draft)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onLabelSave(draft) } }}
              style={{ fontSize: node.fontSize, border: 'none', background: 'transparent', outline: '1px solid #0070F2', fontFamily: 'var(--sapFontFamily)', fontWeight: 'bold', color: node.color, minWidth: 60 }} />
          : <span style={{ fontSize: node.fontSize, fontFamily: 'var(--sapFontFamily)', fontWeight: 'bold', color: node.color }}>{node.label}</span>
        }
      </div>
    )
  }

  // ── Step (standalone step node) ──────────────────────────────────────────

  if (node.type === 'step') {
    return (
      <div
        style={{
          position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
          background: node.color,
          border: selected ? '2px solid #0070F2' : '2px solid rgba(0,0,0,0.15)',
          borderRadius: 6, cursor: 'move', userSelect: 'none', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '4px 8px', overflow: 'hidden',
        }}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
      >
        {editing
          ? <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onBlur={() => onLabelSave(draft)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onLabelSave(draft) } }}
              style={{ fontSize: node.fontSize, border: 'none', background: 'transparent', outline: 'none', color: 'white', fontFamily: 'var(--sapFontFamily)', width: '100%', textAlign: 'center' }} />
          : <span style={{ fontSize: node.fontSize, fontFamily: 'var(--sapFontFamily)', color: 'white', textAlign: 'center' }}>{node.label}</span>
        }
        {selected && RESIZE_DIRS.map(dir => (
          <div key={dir} style={{ position: 'absolute', width: 8, height: 8, background: 'white', border: '1.5px solid #0070F2', borderRadius: 2, zIndex: 10, ...DIR_STYLE[dir] }}
            onMouseDown={e => { e.stopPropagation(); onResizeMouseDown(e, dir) }} />
        ))}
      </div>
    )
  }

  // ── System / Hop (Architecture-style card with inline steps) ────────────────

  const steps = node.steps ?? []
  const minH = ACCENT_H + LABEL_H + steps.length * STEP_ROW_H + (selected ? ADD_STEP_H : 0)
  const boxH = Math.max(node.height, minH)

  function addStep(e: React.MouseEvent) {
    e.stopPropagation()
    const newStep: FlowStep = { id: flowUid(), num: steps.length + 1, text: 'Step', notes: '' }
    const updated = [...steps, newStep]
    onStepsChange(updated)
    setEditingStep(newStep.id)
    setStepDraft(newStep.text)
  }

  function deleteStep(e: React.MouseEvent, stepId: string) {
    e.stopPropagation()
    const updated = steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, num: i + 1 }))
    onStepsChange(updated)
  }

  function moveStep(e: React.MouseEvent, stepId: string, dir: 1 | -1) {
    e.stopPropagation()
    const idx = steps.findIndex(s => s.id === stepId)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= steps.length) return
    const updated = [...steps]
    ;[updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    onStepsChange(updated.map((s, i) => ({ ...s, num: i + 1 })))
  }

  function startEditStep(e: React.MouseEvent, step: FlowStep) {
    e.stopPropagation()
    setEditingStep(step.id)
    setStepDraft(step.text)
  }

  function saveStep(stepId: string) {
    const updated = steps.map(s => s.id === stepId ? { ...s, text: stepDraft } : s)
    onStepsChange(updated)
    setEditingStep(null)
  }

  const arrowBtn: React.CSSProperties = {
    fontSize: '0.6rem', lineHeight: 1, padding: '1px 2px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#aaa', flexShrink: 0, display: 'flex', alignItems: 'center',
  }

  return (
    <div
      style={{
        position: 'absolute', left: node.x, top: node.y, width: node.width, height: boxH,
        border: `1.5px solid ${selected ? '#0070F2' : node.color}`,
        borderRadius: 6, cursor: 'move', userSelect: 'none', boxSizing: 'border-box',
        overflow: 'hidden', background: 'var(--sapTile_Background)',
        boxShadow: selected ? `0 0 0 2px #0070F240, 0 2px 8px rgba(0,0,0,0.15)` : '0 2px 8px rgba(0,0,0,0.15)',
      }}
      onMouseDown={onMouseDown}
    >
      {/* Colored top accent bar (matches Architecture tab) */}
      <div style={{ height: ACCENT_H, background: node.color }} />

      {/* Label row — double-click to edit */}
      <div
        style={{
          height: LABEL_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 8px', cursor: 'move',
        }}
        onDoubleClick={onDoubleClick}
      >
        {editing
          ? <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onBlur={() => onLabelSave(draft)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onLabelSave(draft) } }}
              style={{ fontSize: node.fontSize, border: 'none', background: 'transparent', outline: 'none', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)', fontWeight: 'bold', width: '100%', textAlign: 'center' }} />
          : <span style={{ fontSize: node.fontSize, fontFamily: 'var(--sapFontFamily)', color: 'var(--sapTextColor)', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{node.label}</span>
        }
      </div>

      {/* Step rows */}
      {steps.map((step, idx) => (
        <div key={step.id}
          style={{
            height: STEP_ROW_H, display: 'flex', alignItems: 'center',
            borderTop: '1px solid var(--sapList_BorderColor)', padding: '0 4px', gap: 2,
            background: step.ifaceColor ? step.ifaceColor + '18' : 'transparent',
          }}
        >
          {/* Number badge */}
          <span style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'white', background: step.ifaceColor ?? node.color, borderRadius: 3, minWidth: 16, textAlign: 'center', padding: '0 2px', flexShrink: 0, fontWeight: 'bold' }}>
            {step.num}
          </span>

          {/* Step text */}
          {editingStep === step.id
            ? <input autoFocus value={stepDraft} onChange={e => setStepDraft(e.target.value)}
                onBlur={() => saveStep(step.id)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveStep(step.id) } }}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, fontSize: '0.72rem', border: 'none', outline: '1px solid #0070F2', fontFamily: 'var(--sapFontFamily)', borderRadius: 2, padding: '1px 4px', background: 'white' }} />
            : <span
                style={{ flex: 1, fontSize: '0.72rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                onDoubleClick={e => startEditStep(e, step)}
              >{step.text}</span>
          }

          {/* ifaceRef badge (group view) */}
          {step.ifaceRef && (
            <span style={{ fontFamily: 'monospace', fontSize: '0.62rem', color: step.ifaceColor ?? '#777', border: `1px solid ${step.ifaceColor ?? '#ccc'}`, borderRadius: 3, padding: '0 3px', flexShrink: 0 }}>
              {step.ifaceRef}
            </span>
          )}

          {/* Reorder + delete (only when selected and not a group-aggregated step) */}
          {selected && !step.ifaceRef && (<>
            <button style={arrowBtn} onClick={e => moveStep(e, step.id, -1)} title="Move up" disabled={idx === 0}>▲</button>
            <button style={arrowBtn} onClick={e => moveStep(e, step.id,  1)} title="Move down" disabled={idx === steps.length - 1}>▼</button>
            <button onClick={e => deleteStep(e, step.id)}
              style={{ ...arrowBtn, fontSize: '0.72rem', padding: '0 3px' }}>×</button>
          </>)}
        </div>
      ))}

      {/* Add step row */}
      {selected && (
        <div style={{ height: ADD_STEP_H, display: 'flex', alignItems: 'center', padding: '0 8px', borderTop: steps.length > 0 ? '1px solid var(--sapList_BorderColor)' : 'none' }}>
          <button onClick={addStep}
            style={{ fontSize: '0.72rem', color: node.color, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--sapFontFamily)' }}>
            + Step
          </button>
        </div>
      )}

      {selected && RESIZE_DIRS.map(dir => (
        <div key={dir} style={{ position: 'absolute', width: 8, height: 8, background: 'var(--sapTile_Background)', border: '1.5px solid #0070F2', borderRadius: 2, zIndex: 10, ...DIR_STYLE[dir] }}
          onMouseDown={e => { e.stopPropagation(); onResizeMouseDown(e, dir) }} />
      ))}
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarProps {
  tool: Tool
  setTool: (t: Tool) => void
  selectedNode: FlowNode | null
  selectedEdge: FlowEdge | null
  onNodeChange: (u: Partial<FlowNode>) => void
  onEdgeChange: (u: Partial<FlowEdge>) => void
  onAddWaypoint: () => void
  onDeleteSelected: () => void
  onFit: () => void
  onSave: () => void
  onReseed?: () => void
  saving: boolean
}

function Toolbar({ tool, setTool, selectedNode, selectedEdge, onNodeChange, onEdgeChange, onAddWaypoint, onDeleteSelected, onFit, onSave, onReseed, saving }: ToolbarProps) {
  const btn = (active: boolean, danger = false): React.CSSProperties => ({
    height: 26, padding: '0 8px', fontSize: '0.74rem', cursor: 'pointer', borderRadius: 4,
    fontWeight: active ? 'bold' : 'normal',
    background: active ? '#0070F2' : 'var(--sapButton_Background)',
    color: danger ? '#c0392b' : active ? 'white' : 'var(--sapButton_TextColor)',
    border: danger ? '1px solid #c0392b' : active ? '1px solid #0070F2' : '1px solid var(--sapButton_BorderColor)',
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', flexShrink: 0, flexWrap: 'wrap',
      borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)',
    }}>
      {/* Tool buttons */}
      {([
        ['select',   'Select'],
        ['system',   'System'],
        ['hop',      'Hop'],
        ['step',     'Step'],
        ['text',     'Text'],
        ['boundary', 'Boundary'],
        ['line',     'Line'],
      ] as [Tool, string][]).map(([t, label]) => (
        <button key={t} style={btn(tool === t)} onClick={() => setTool(t)}>{label}</button>
      ))}

      <div style={{ width: 1, height: 18, background: 'var(--sapList_BorderColor)', margin: '0 2px' }} />

      {/* Node properties */}
      {selectedNode && selectedNode.type !== 'boundary' && (<>
        <span style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>Color</span>
        {PRESET_COLORS.map(c => (
          <button key={c} onClick={() => onNodeChange({ color: c })} title={c} style={{
            width: 15, height: 15, borderRadius: 3, background: c, padding: 0, cursor: 'pointer', flexShrink: 0,
            border: selectedNode.color === c ? '2px solid #333' : '1px solid rgba(0,0,0,0.15)',
          }} />
        ))}
        <input type="color" value={selectedNode.color} onChange={e => onNodeChange({ color: e.target.value })}
          title="Custom color" style={{ width: 20, height: 15, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 2 }} />
        <span style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginLeft: 4 }}>Font</span>
        <input type="number" min={8} max={36} value={selectedNode.fontSize}
          onChange={e => onNodeChange({ fontSize: Number(e.target.value) })}
          style={{ width: 42, fontSize: '0.74rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: 3, padding: '1px 4px' }} />
      </>)}

      {/* Edge properties */}
      {selectedEdge && (<>
        <span style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>Arrow</span>
        <select value={selectedEdge.arrow} onChange={e => onEdgeChange({ arrow: e.target.value as FlowEdge['arrow'] })}
          style={{ fontSize: '0.74rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: 3, padding: '2px 4px' }}>
          <option value="end">End →</option>
          <option value="none">None —</option>
          <option value="both">Both ↔</option>
        </select>
        <span style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>Label</span>
        <input value={selectedEdge.label} onChange={e => onEdgeChange({ label: e.target.value })}
          style={{ width: 80, fontSize: '0.74rem', border: '1px solid var(--sapList_BorderColor)', borderRadius: 3, padding: '2px 4px' }} />
        <button style={btn(false)} onClick={onAddWaypoint} title="Split line to add a bend point">+ Bend</button>
      </>)}

      {(selectedNode || selectedEdge) && (
        <button style={btn(false, true)} onClick={onDeleteSelected}>Delete</button>
      )}

      <div style={{ flex: 1 }} />
      {onReseed && (
        <button style={btn(false)} onClick={onReseed} title="Regenerate layout from interface data (discards current diagram)">
          Reseed
        </button>
      )}
      <button style={btn(false)} onClick={onFit} title="Fit all nodes into view">Fit</button>
      <Button design="Emphasized" onClick={onSave} disabled={saving}
        style={{ height: 26, fontSize: '0.74rem' } as React.CSSProperties}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}

// ── FlowCanvas ────────────────────────────────────────────────────────────────

interface Props {
  initialState: FlowDiagramState | null
  onSave: (state: FlowDiagramState) => Promise<void>
  onReseed?: () => void
  saving?: boolean
}

export default function FlowCanvas({ initialState, onSave, onReseed, saving = false }: Props) {
  const [nodes, setNodes] = useState<FlowNode[]>(initialState?.nodes ?? [])
  const [edges, setEdges] = useState<FlowEdge[]>(initialState?.edges ?? [])
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [rubberTo, setRubberTo] = useState<{ x: number; y: number } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  // Refs so closures always see latest state
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  panRef.current = pan
  zoomRef.current = zoom

  useEffect(() => {
    setNodes(initialState?.nodes ?? [])
    setEdges(initialState?.edges ?? [])
    setSelected(null)
    setEditing(null)
    setPan({ x: 80, y: 60 })
    setZoom(1)
  }, [initialState])

  // ── Coord helpers ─────────────────────────────────────────────────────────

  function toCanvas(sx: number, sy: number) {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: (sx - rect.left - panRef.current.x) / zoomRef.current,
      y: (sy - rect.top  - panRef.current.y) / zoomRef.current,
    }
  }

  // ── Wheel zoom ────────────────────────────────────────────────────────────

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const nz = Math.max(0.2, Math.min(3, zoom * factor))
    setZoom(nz)
    setPan(p => ({ x: cx - (cx - p.x) * (nz / zoom), y: cy - (cy - p.y) * (nz / zoom) }))
  }

  // ── Background mousedown ──────────────────────────────────────────────────

  function onBgMouseDown(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return

    if (tool === 'select') {
      setSelected(null); setEditing(null)
      setDrag({ kind: 'pan', ox: pan.x, oy: pan.y, sx: e.clientX, sy: e.clientY })
      return
    }
    if (tool === 'line') return

    const pt = toCanvas(e.clientX, e.clientY)
    const d = FLOW_DEFAULTS[tool as FlowNodeType]
    const newNode: FlowNode = {
      id: flowUid(), type: tool as FlowNodeType,
      label: { system: 'System', hop: 'Via', step: 'Step', text: 'Label', boundary: 'Boundary' }[tool as FlowNodeType] ?? tool,
      x: tool === 'boundary' ? snap(pt.x) : snap(pt.x - d.w / 2),
      y: tool === 'boundary' ? 0 : snap(pt.y - d.h / 2),
      width: d.w, height: d.h, color: d.color, fontSize: d.fs,
    }
    setNodes(ns => [...ns, newNode])
    setSelected({ kind: 'node', id: newNode.id })
    setTool('select')
  }

  // ── Node mousedown ────────────────────────────────────────────────────────

  function onNodeMouseDown(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation()
    const node = nodesRef.current.find(n => n.id === nodeId)!

    if (tool === 'line') {
      setDrag({ kind: 'drawline', fromId: nodeId })
      setRubberTo(nodeCenter(node))
      return
    }

    setSelected({ kind: 'node', id: nodeId }); setEditing(null)
    setDrag({ kind: 'node', id: nodeId, ox: node.x, oy: node.y, sx: e.clientX, sy: e.clientY, nw: node.width, nh: node.height, isBoundary: node.type === 'boundary' })
  }

  // ── Resize mousedown ──────────────────────────────────────────────────────

  function onResizeMouseDown(e: React.MouseEvent, nodeId: string, dir: ResizeDir) {
    e.stopPropagation()
    const node = nodesRef.current.find(n => n.id === nodeId)!
    setDrag({ kind: 'resize', id: nodeId, ox: node.x, oy: node.y, ow: node.width, oh: node.height, sx: e.clientX, sy: e.clientY, dir })
  }

  // ── Waypoint mousedown ────────────────────────────────────────────────────

  function onWaypointMouseDown(e: React.MouseEvent, edgeId: string, idx: number) {
    e.stopPropagation()
    setDrag({ kind: 'waypoint', eid: edgeId, idx, sx: e.clientX, sy: e.clientY })
  }

  // ── Mouse move ────────────────────────────────────────────────────────────

  function onMouseMove(e: React.MouseEvent) {
    if (!drag) return

    if (drag.kind === 'pan') {
      setPan({ x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy })
      return
    }

    if (drag.kind === 'node') {
      const dx = (e.clientX - drag.sx) / zoomRef.current
      const dy = (e.clientY - drag.sy) / zoomRef.current
      const nx = snap(drag.ox + dx)
      const ny = drag.isBoundary ? 0 : snap(drag.oy + dy)
      const cX = nx + drag.nw / 2
      const cY = ny + drag.nh / 2

      setNodes(ns => ns.map(n => n.id !== drag.id ? n : { ...n, x: nx, y: ny }))
      setEdges(es => es.map(edge => {
        if (edge.fromNodeId === drag.id) {
          const p = [...edge.path]; p[0] = { x: cX, y: cY }; return { ...edge, path: p }
        }
        if (edge.toNodeId === drag.id) {
          const p = [...edge.path]; p[p.length - 1] = { x: cX, y: cY }; return { ...edge, path: p }
        }
        return edge
      }))
      return
    }

    if (drag.kind === 'resize') {
      const dx = (e.clientX - drag.sx) / zoomRef.current
      const dy = (e.clientY - drag.sy) / zoomRef.current
      const dir = drag.dir
      let x = drag.ox, y = drag.oy, w = drag.ow, h = drag.oh
      if (dir.includes('e')) w = Math.max(40, snap(drag.ow + dx))
      if (dir.includes('s')) h = Math.max(20, snap(drag.oh + dy))
      if (dir.includes('w')) { const rx = drag.ox + drag.ow; x = Math.min(rx - 40, snap(drag.ox + dx)); w = rx - x }
      if (dir.includes('n')) { const by = drag.oy + drag.oh; y = Math.min(by - 20, snap(drag.oy + dy)); h = by - y }
      setNodes(ns => ns.map(n => n.id !== drag.id ? n : { ...n, x, y, width: w, height: h }))
      return
    }

    if (drag.kind === 'waypoint') {
      const pt = toCanvas(e.clientX, e.clientY)
      setEdges(es => es.map(edge => {
        if (edge.id !== drag.eid) return edge
        const p = [...edge.path]; p[drag.idx] = { x: snap(pt.x), y: snap(pt.y) }
        return { ...edge, path: p }
      }))
      return
    }

    if (drag.kind === 'drawline') {
      setRubberTo(toCanvas(e.clientX, e.clientY))
      return
    }
  }

  // ── Mouse up ──────────────────────────────────────────────────────────────

  function onMouseUp(e: React.MouseEvent) {
    if (drag?.kind === 'drawline') {
      const pt = toCanvas(e.clientX, e.clientY)
      const fromNode = nodesRef.current.find(n => n.id === drag.fromId)!
      const toNode = nodesRef.current.find(n => n.id !== drag.fromId && hitTest(n, pt))
      const fromPt = nodeCenter(fromNode)
      const toPt = toNode ? nodeCenter(toNode) : pt
      if (Math.hypot(toPt.x - fromPt.x, toPt.y - fromPt.y) > 15) {
        const newEdge: FlowEdge = {
          id: flowUid(), fromNodeId: drag.fromId, toNodeId: toNode?.id ?? null,
          path: [fromPt, toPt], label: '', arrow: 'end',
        }
        setEdges(es => [...es, newEdge])
        setSelected({ kind: 'edge', id: newEdge.id })
      }
      setRubberTo(null)
    }
    setDrag(null)
  }

  // ── Delete on key ─────────────────────────────────────────────────────────

  function deleteSelected() {
    if (!selected) return
    if (selected.kind === 'node') {
      setNodes(ns => ns.filter(n => n.id !== selected.id))
      setEdges(es => es.filter(e => e.fromNodeId !== selected.id && e.toNodeId !== selected.id))
    } else {
      setEdges(es => es.filter(e => e.id !== selected.id))
    }
    setSelected(null)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      deleteSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fit all into view ─────────────────────────────────────────────────────

  function fit() {
    const visible = nodes.filter(n => n.type !== 'boundary')
    if (visible.length === 0) return
    const minX = Math.min(...visible.map(n => n.x))
    const minY = Math.min(...visible.map(n => n.y))
    const maxX = Math.max(...visible.map(n => n.x + n.width))
    const maxY = Math.max(...visible.map(n => n.y + n.height))
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const zx = (rect.width - 80) / Math.max(maxX - minX, 100)
    const zy = (rect.height - 80) / Math.max(maxY - minY, 100)
    const nz = Math.max(0.2, Math.min(zx, zy, 2))
    setZoom(nz)
    setPan({ x: 40 - minX * nz, y: 40 - minY * nz })
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selNode = selected?.kind === 'node' ? nodes.find(n => n.id === selected.id) ?? null : null
  const selEdge = selected?.kind === 'edge' ? edges.find(e => e.id === selected.id) ?? null : null
  const rubberFromNode = drag?.kind === 'drawline' ? nodesRef.current.find(n => n.id === drag.fromId) : null
  const rubberFrom = rubberFromNode ? nodeCenter(rubberFromNode) : null

  const cursor = drag?.kind === 'pan' ? 'grabbing'
    : tool === 'select' ? 'default'
    : 'crosshair'

  // Boundary nodes behind, text above, selected on top
  const sortedNodes = [...nodes].sort((a, b) => {
    const order = (n: FlowNode) =>
      n.type === 'boundary' ? 0
      : (selected?.kind === 'node' && selected.id === n.id) ? 3
      : n.type === 'text' ? 2
      : 1
    return order(a) - order(b)
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Toolbar
        tool={tool} setTool={setTool}
        selectedNode={selNode} selectedEdge={selEdge}
        onNodeChange={u => { if (selNode) setNodes(ns => ns.map(n => n.id === selNode.id ? { ...n, ...u } : n)) }}
        onEdgeChange={u => { if (selEdge) setEdges(es => es.map(e => e.id === selEdge.id ? { ...e, ...u } : e)) }}
        onAddWaypoint={() => {
          if (!selEdge) return
          const path = selEdge.path
          const mi = Math.max(1, Math.floor(path.length / 2))
          const a = path[mi - 1], b = path[mi]
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          setEdges(es => es.map(e => {
            if (e.id !== selEdge.id) return e
            const p = [...e.path]; p.splice(mi, 0, mid); return { ...e, path: p }
          }))
        }}
        onDeleteSelected={deleteSelected}
        onFit={fit}
        onSave={() => onSave({ nodes, edges })}
        onReseed={onReseed}
        saving={saving}
      />

      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f4f5f7', cursor }}
        onMouseDown={onBgMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { setDrag(null); setRubberTo(null) }}
        onWheel={onWheel}
      >
        {/* Dot grid */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <pattern id="fdgrid" width={20 * zoom} height={20 * zoom}
              x={pan.x % (20 * zoom)} y={pan.y % (20 * zoom)} patternUnits="userSpaceOnUse">
              <circle cx={10 * zoom} cy={10 * zoom} r={0.7} fill="#bbb" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#fdgrid)" />
        </svg>

        {/* Transformed canvas */}
        <div style={{
          position: 'absolute', left: 0, top: 0,
          transformOrigin: '0 0', transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
        }}>
          {/* Edges SVG (below nodes) */}
          <svg style={{ position: 'absolute', left: 0, top: 0, width: 5000, height: 5000, overflow: 'visible', pointerEvents: 'none' }}>
            <defs>
              <marker id="fd-arr-end" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#333" />
              </marker>
              <marker id="fd-arr-start" markerWidth="8" markerHeight="8" refX="1" refY="3" orient="auto-start-reverse">
                <path d="M0,0 L0,6 L8,3 z" fill="#333" />
              </marker>
            </defs>

            {edges.map(edge => {
              const isSel = selected?.kind === 'edge' && selected.id === edge.id
              const pts = edge.path.map(p => `${p.x},${p.y}`).join(' ')
              const mEnd   = edge.arrow !== 'none'  ? 'url(#fd-arr-end)'   : undefined
              const mStart = edge.arrow === 'both'  ? 'url(#fd-arr-start)' : undefined

              let lx = 0, ly = 0, hasLabel = false
              if (edge.label && edge.path.length >= 2) {
                const mi = Math.floor(edge.path.length / 2)
                const a = edge.path[mi - 1], b = edge.path[mi]
                lx = (a.x + b.x) / 2; ly = (a.y + b.y) / 2; hasLabel = true
              }

              return (
                <g key={edge.id}>
                  {/* Wide invisible hit target */}
                  <polyline points={pts} stroke="transparent" strokeWidth={12} fill="none"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => { setSelected({ kind: 'edge', id: edge.id }); setTool('select') }} />
                  {/* Visible line */}
                  <polyline points={pts}
                    stroke={isSel ? '#0070F2' : '#2c3e50'} strokeWidth={isSel ? 2 : 1.5}
                    fill="none" markerEnd={mEnd} markerStart={mStart}
                    strokeDasharray={isSel ? '5 3' : undefined} />
                  {hasLabel && (
                    <text x={lx} y={ly - 5} textAnchor="middle" fontSize={11}
                      fill="#555" fontFamily="var(--sapFontFamily)">{edge.label}</text>
                  )}
                </g>
              )
            })}

            {/* Rubber-band line while drawing */}
            {rubberFrom && rubberTo && (
              <line x1={rubberFrom.x} y1={rubberFrom.y} x2={rubberTo.x} y2={rubberTo.y}
                stroke="#0070F2" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#fd-arr-end)" />
            )}
          </svg>

          {/* Nodes */}
          {sortedNodes.map(node => (
            <NodeBox
              key={node.id}
              node={node}
              selected={selected?.kind === 'node' && selected.id === node.id}
              editing={editing === node.id}
              onMouseDown={e => onNodeMouseDown(e, node.id)}
              onDoubleClick={() => setEditing(node.id)}
              onLabelSave={label => { setNodes(ns => ns.map(n => n.id !== node.id ? n : { ...n, label })); setEditing(null) }}
              onResizeMouseDown={(e, dir) => onResizeMouseDown(e, node.id, dir)}
              onStepsChange={steps => setNodes(ns => ns.map(n => n.id !== node.id ? n : { ...n, steps }))}
            />
          ))}

          {/* Waypoint handles — rendered above nodes */}
          {selEdge && (
            <svg style={{ position: 'absolute', left: 0, top: 0, width: 5000, height: 5000, overflow: 'visible', pointerEvents: 'none' }}>
              {selEdge.path.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r={5}
                  fill="white" stroke="#0070F2" strokeWidth={1.5}
                  style={{ pointerEvents: 'all', cursor: 'move' }}
                  onMouseDown={e => { e.stopPropagation(); onWaypointMouseDown(e, selEdge.id, i) }}
                />
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
