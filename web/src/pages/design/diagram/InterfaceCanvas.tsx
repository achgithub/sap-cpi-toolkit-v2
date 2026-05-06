import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { IFInterface, IFSystem, CanvasElement, RegistryConfig } from './types'
import { getSystemColor } from './types'
import { borderPoint, snap } from './canvasUtils'
import type { Point } from './canvasUtils'

const EL_W   = 180
const EL_H   = 80
const GAP_X  = 220
const GAP_Y  = 100

const toolBtn: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid var(--sapList_BorderColor)',
  borderRadius: '4px', background: 'var(--sapTile_Background)',
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
  color: 'var(--sapTextColor)', cursor: 'pointer',
}

const KIND_HEADER: Record<string, string> = {
  middleware_node: '#7B1FA2',
  text:            'transparent',
  firewall:        '#E53935',
  step:            '#FB8C00',
  boundary:        '#43A047',
}

const USER_KINDS = new Set(['text', 'firewall', 'step', 'boundary'])

interface Props {
  iface:                IFInterface
  systems:              IFSystem[]
  config:               RegistryConfig
  listCanvasElements:   ()                                           => Promise<CanvasElement[]>
  addCanvasElement:     (body: Partial<CanvasElement>)              => Promise<CanvasElement>
  updateCanvasElement:  (eid: string, body: Partial<CanvasElement>) => Promise<CanvasElement>
  deleteCanvasElement:  (eid: string)                               => Promise<void>
}

function bootstrapLayout(
  senderKey:     string | null,
  middlewareKeys: string[],
  receiverKeys:   string[],
): Record<string, Point> {
  const total   = Math.max(1, receiverKeys.length)
  const centerY = ((total - 1) * GAP_Y) / 2
  const out: Record<string, Point> = {}

  if (senderKey) out[senderKey] = { x: 60, y: centerY }

  middlewareKeys.forEach((k, i) => {
    out[k] = { x: 60 + GAP_X * (i + 1), y: centerY }
  })

  const rcvX = 60 + GAP_X * (middlewareKeys.length + 1)
  receiverKeys.forEach((k, i) => { out[k] = { x: rcvX, y: i * GAP_Y } })

  return out
}

export default function InterfaceCanvas({
  iface, systems, config,
  listCanvasElements, addCanvasElement, updateCanvasElement, deleteCanvasElement,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [elements,  setElements]  = useState<CanvasElement[]>([])
  const [pos,       setPos]       = useState<Record<string, Point>>({})
  const [sizes,     setSizes]     = useState<Record<string, { w: number; h: number }>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText,  setEditText]  = useState('')
  const [pan,       setPan]       = useState({ x: 60, y: 60 })
  const [scale,     setScale]     = useState(1)
  const [loading,   setLoading]   = useState(true)

  // Stable refs so event-listener closures don't go stale
  const elementsRef    = useRef(elements)
  const scaleRef       = useRef(scale)
  const listRef        = useRef(listCanvasElements)
  const addRef         = useRef(addCanvasElement)
  const updateRef      = useRef(updateCanvasElement)
  const deleteRef      = useRef(deleteCanvasElement)
  useEffect(() => { elementsRef.current = elements },               [elements])
  useEffect(() => { scaleRef.current    = scale },                  [scale])
  useEffect(() => { listRef.current     = listCanvasElements },     [listCanvasElements])
  useEffect(() => { addRef.current      = addCanvasElement },       [addCanvasElement])
  useEffect(() => { updateRef.current   = updateCanvasElement },    [updateCanvasElement])
  useEffect(() => { deleteRef.current   = deleteCanvasElement },    [deleteCanvasElement])

  const drag   = useRef<{ id: string; ox: number; oy: number; mx: number; my: number; resize: boolean } | null>(null)
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const initedForRef = useRef<string | null>(null)

  // Load / bootstrap
  useEffect(() => {
    if (initedForRef.current === iface.id) return
    initedForRef.current = iface.id

    setLoading(true)
    setElements([])
    setPos({})
    setSizes({})
    setEditingId(null)

    async function init() {
      try {
        let elems = await listRef.current()

        if (elems.length === 0) {
          const senderSys = iface.sender_system_id
            ? systems.find(s => s.id === iface.sender_system_id) ?? null
            : null
          const rcvSystems = iface.receivers
            .filter(r => r.system_id)
            .map(r => systems.find(s => s.id === r.system_id))
            .filter((s): s is IFSystem => !!s)

          const senderKey = senderSys ? 'sender' : null
          const mwKeys    = iface.middleware_chain.map((_, i) => `mw_${i}`)
          const rcvKeys   = rcvSystems.map((_, i) => `rcv_${i}`)
          const layout    = bootstrapLayout(senderKey, mwKeys, rcvKeys)

          const creates: Promise<CanvasElement>[] = []
          let sortOrder = 0

          if (senderSys && senderKey) {
            creates.push(addRef.current({
              kind: 'system_node', system_id: senderSys.id, label: senderSys.name,
              pos_x: layout[senderKey].x, pos_y: layout[senderKey].y,
              width: EL_W, height: EL_H, sort_order: sortOrder++,
            }))
          }
          iface.middleware_chain.forEach((node, i) => {
            creates.push(addRef.current({
              kind: 'middleware_node',
              label: node.label || node.platform,
              body:  [node.platform, node.transport, node.note].filter(Boolean).join('\n'),
              pos_x: layout[mwKeys[i]].x, pos_y: layout[mwKeys[i]].y,
              width: EL_W, height: EL_H, sort_order: sortOrder++,
            }))
          })
          rcvSystems.forEach((sys, i) => {
            creates.push(addRef.current({
              kind: 'system_node', system_id: sys.id, label: sys.name,
              pos_x: layout[rcvKeys[i]].x, pos_y: layout[rcvKeys[i]].y,
              width: EL_W, height: EL_H, sort_order: sortOrder++,
            }))
          })

          elems = creates.length > 0 ? await Promise.all(creates) : []
        }

        const posMap:  Record<string, Point>                = {}
        const sizeMap: Record<string, { w: number; h: number }> = {}
        elems.forEach(el => {
          posMap[el.id]  = { x: el.pos_x, y: el.pos_y }
          sizeMap[el.id] = { w: el.width, h: el.height }
        })
        setElements(elems)
        setPos(posMap)
        setSizes(sizeMap)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [iface.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit view
  const fitView = useCallback(() => {
    const el = containerRef.current
    if (!el || elements.length === 0) return
    const rect = el.getBoundingClientRect()
    const xs = elements.map(e => pos[e.id]?.x ?? 0)
    const ys = elements.map(e => pos[e.id]?.y ?? 0)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...elements.map((e, i) => xs[i] + (sizes[e.id]?.w ?? EL_W)))
    const maxY = Math.max(...elements.map((e, i) => ys[i] + (sizes[e.id]?.h ?? EL_H)))
    const pad  = 60
    const ns   = Math.min(
      (rect.width  - pad * 2) / Math.max(maxX - minX, 1),
      (rect.height - pad * 2) / Math.max(maxY - minY, 1),
      1.5,
    )
    setScale(ns)
    setPan({
      x: (rect.width  - (maxX - minX) * ns) / 2 - minX * ns,
      y: (rect.height - (maxY - minY) * ns) / 2 - minY * ns,
    })
  }, [elements, pos, sizes])

  const fitViewRef = useRef(fitView)
  useEffect(() => { fitViewRef.current = fitView })
  useEffect(() => {
    if (!loading && elements.length > 0) {
      const t = setTimeout(() => fitViewRef.current(), 80)
      return () => clearTimeout(t)
    }
  }, [loading, elements.length])

  // Mouse handlers (stable — use refs)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const s = scaleRef.current
      if (drag.current) {
        const { id, ox, oy, mx, my, resize } = drag.current
        const dx = (e.clientX - mx) / s
        const dy = (e.clientY - my) / s
        if (resize) {
          setSizes(prev => ({ ...prev, [id]: { w: Math.max(80, ox + dx), h: Math.max(40, oy + dy) } }))
        } else {
          setPos(prev => ({ ...prev, [id]: { x: ox + dx, y: oy + dy } }))
        }
      }
      if (panRef.current) {
        const { px, py, mx, my } = panRef.current
        setPan({ x: px + e.clientX - mx, y: py + e.clientY - my })
      }
    }
    function onUp(e: MouseEvent) {
      if (drag.current) {
        const { id, ox, oy, mx, my, resize } = drag.current
        drag.current = null
        const s  = scaleRef.current
        const dx = (e.clientX - mx) / s
        const dy = (e.clientY - my) / s
        const el = elementsRef.current.find(x => x.id === id)
        if (!el) return
        if (resize) {
          const w = Math.max(80, ox + dx), h = Math.max(40, oy + dy)
          setSizes(prev => ({ ...prev, [id]: { w, h } }))
          updateRef.current(id, { ...el, width: w, height: h }).catch(() => {})
        } else {
          const nx = snap(ox + dx), ny = snap(oy + dy)
          setPos(prev => ({ ...prev, [id]: { x: nx, y: ny } }))
          updateRef.current(id, { ...el, pos_x: nx, pos_y: ny }).catch(() => {})
        }
      }
      panRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, []) // stable — all state accessed via refs

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setScale(s => {
        const ns = Math.max(0.2, Math.min(3, s * (e.deltaY < 0 ? 1.1 : 0.9)))
        setPan(p => ({ x: mx - (mx - p.x) * (ns / s), y: my - (my - p.y) * (ns / s) }))
        return ns
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onBoxMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const p = pos[id] ?? { x: 0, y: 0 }
    drag.current = { id, ox: p.x, oy: p.y, mx: e.clientX, my: e.clientY, resize: false }
  }, [pos])

  const onResizeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const s = sizes[id] ?? { w: EL_W, h: EL_H }
    drag.current = { id, ox: s.w, oy: s.h, mx: e.clientX, my: e.clientY, resize: true }
  }, [sizes])

  const onBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setEditingId(null)
    panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  async function addUserElement(kind: CanvasElement['kind']) {
    const rect = containerRef.current?.getBoundingClientRect()
    const cx   = rect ? (rect.width  / 2 - pan.x) / scale : 200
    const cy   = rect ? (rect.height / 2 - pan.y) / scale : 200
    const el   = await addRef.current({
      kind, label: kind.charAt(0).toUpperCase() + kind.slice(1),
      pos_x: snap(cx - EL_W / 2), pos_y: snap(cy - EL_H / 2),
      width: EL_W, height: EL_H, sort_order: elements.length,
    })
    setElements(prev => [...prev, el])
    setPos(prev   => ({ ...prev, [el.id]: { x: el.pos_x, y: el.pos_y } }))
    setSizes(prev => ({ ...prev, [el.id]: { w: el.width, h: el.height } }))
  }

  async function handleDelete(id: string) {
    await deleteRef.current(id)
    setElements(prev => prev.filter(e => e.id !== id))
    setPos(({ [id]: _, ...rest }) => rest)
    setSizes(({ [id]: _, ...rest }) => rest)
  }

  async function saveBodyEdit(id: string, text: string) {
    const el = elements.find(e => e.id === id)
    if (!el) return
    const updated = await updateRef.current(id, { ...el, body: text })
    setElements(prev => prev.map(e => e.id === id ? updated : e))
    setEditingId(null)
  }

  // Build connection edges
  const senderEl = elements.find(e => e.kind === 'system_node' && e.system_id === iface.sender_system_id)
  const mwEls    = elements
    .filter(e => e.kind === 'middleware_node')
    .sort((a, b) => a.sort_order - b.sort_order)
  const rcvEls   = elements.filter(e => e.kind === 'system_node' && e.system_id !== iface.sender_system_id)

  const edges: Array<{ from: string; to: string }> = []
  if (senderEl) {
    if (mwEls.length > 0) {
      edges.push({ from: senderEl.id, to: mwEls[0].id })
      for (let i = 0; i < mwEls.length - 1; i++) {
        edges.push({ from: mwEls[i].id, to: mwEls[i + 1].id })
      }
      const lastMw = mwEls[mwEls.length - 1]
      rcvEls.forEach(rcv => edges.push({ from: lastMw.id, to: rcv.id }))
    } else {
      rcvEls.forEach(rcv => edges.push({ from: senderEl.id, to: rcv.id }))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{
        flexShrink: 0, padding: '6px 10px',
        borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)',
        display: 'flex', gap: '6px', alignItems: 'center',
      }}>
        <button style={toolBtn} onClick={() => addUserElement('text')}>+ Text</button>
        <button style={toolBtn} onClick={() => addUserElement('firewall')}>+ Firewall</button>
        <button style={toolBtn} onClick={() => addUserElement('step')}>+ Step</button>
        <button style={toolBtn} onClick={() => addUserElement('boundary')}>+ Boundary</button>
        <div style={{ flex: 1 }} />
        <button style={toolBtn} onClick={fitView}>⤢ Fit</button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        onMouseDown={onBgMouseDown}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--sapBackgroundColor)', cursor: 'grab' }}
      >
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapTextColor)',
          }}>
            Loading…
          </div>
        )}

        <div style={{
          position: 'absolute', inset: 0,
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`,
        }}>

          {/* Boundary elements (z-index below other boxes) */}
          {elements.filter(el => el.kind === 'boundary').map(el => {
            const p = pos[el.id]   ?? { x: 0, y: 0 }
            const s = sizes[el.id] ?? { w: el.width, h: el.height }
            return (
              <div
                key={el.id}
                onMouseDown={e => onBoxMouseDown(e, el.id)}
                style={{
                  position: 'absolute', left: p.x, top: p.y, width: s.w, height: s.h,
                  border: `2px dashed ${KIND_HEADER.boundary}`, borderRadius: '8px',
                  background: 'rgba(67,160,71,0.06)', cursor: 'grab', zIndex: 1,
                }}
              >
                <span style={{
                  position: 'absolute', top: '4px', left: '8px',
                  fontFamily: 'var(--sapFontFamily)', fontSize: '0.7rem',
                  color: KIND_HEADER.boundary, fontWeight: 600,
                }}>
                  {el.label}
                </span>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => handleDelete(el.id)}
                  style={{ position: 'absolute', top: 2, right: 2, background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 4px', fontSize: '0.65rem', color: 'var(--sapNegativeColor)' }}
                >✕</button>
                <div
                  onMouseDown={e => onResizeMouseDown(e, el.id)}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, cursor: 'se-resize', background: KIND_HEADER.boundary, borderRadius: '2px 0 0 0', opacity: 0.6 }}
                />
              </div>
            )
          })}

          {/* SVG edges */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', zIndex: 3 }}>
            {edges.map(({ from, to }) => {
              const pa = pos[from], pb = pos[to]
              if (!pa || !pb) return null
              const sa = sizes[from] ?? { w: EL_W, h: EL_H }
              const sb = sizes[to]   ?? { w: EL_W, h: EL_H }
              const start = borderPoint(pa.x + sa.w / 2, pa.y + sa.h / 2, pb.x + sb.w / 2, pb.y + sb.h / 2, sa.w, sa.h)
              const end   = borderPoint(pb.x + sb.w / 2, pb.y + sb.h / 2, pa.x + sa.w / 2, pa.y + sa.h / 2, sb.w, sb.h)
              return (
                <line key={`${from}-${to}`}
                  x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                  stroke="var(--sapContent_LabelColor)" strokeWidth={1.5}
                />
              )
            })}
          </svg>

          {/* All non-boundary elements */}
          {elements.filter(el => el.kind !== 'boundary').map(el => {
            const p          = pos[el.id]  ?? { x: 0, y: 0 }
            const s          = sizes[el.id] ?? { w: el.width, h: el.height }
            const sys        = el.system_id ? systems.find(x => x.id === el.system_id) : null
            const headerColor = el.kind === 'system_node'
              ? getSystemColor(sys?.system_type ?? '', config)
              : KIND_HEADER[el.kind] ?? '#555'
            const isEditing  = editingId === el.id
            const canDelete  = USER_KINDS.has(el.kind)

            return (
              <div
                key={el.id}
                onMouseDown={e => onBoxMouseDown(e, el.id)}
                style={{
                  position: 'absolute', left: p.x, top: p.y, width: s.w, height: s.h,
                  boxSizing: 'border-box', cursor: 'grab', userSelect: 'none',
                  background: 'var(--sapTile_Background)',
                  border: '1px solid var(--sapList_BorderColor)',
                  borderTop: `4px solid ${headerColor}`,
                  borderRadius: '6px', padding: '6px 8px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 5,
                  overflow: 'hidden',
                }}
              >
                {canDelete && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => handleDelete(el.id)}
                    style={{ position: 'absolute', top: 2, right: 2, background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px 4px', fontSize: '0.65rem', color: 'var(--sapNegativeColor)', zIndex: 10 }}
                  >✕</button>
                )}
                <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: canDelete ? '16px' : 0 }}>
                  {el.label}
                </span>
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onBlur={() => saveBodyEdit(el.id, editText)}
                    onMouseDown={e => e.stopPropagation()}
                    style={{ flex: 1, resize: 'none', border: '1px solid var(--sapHighlightColor)', borderRadius: '3px', fontFamily: 'var(--sapFontFamily)', fontSize: '0.7rem', color: 'var(--sapTextColor)', background: 'var(--sapField_Background)', padding: '2px 4px' }}
                  />
                ) : (
                  <span
                    onDoubleClick={e => { e.stopPropagation(); setEditingId(el.id); setEditText(el.body) }}
                    style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', overflow: 'hidden', cursor: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {el.body || <span style={{ opacity: 0.35, fontStyle: 'italic' }}>double-click to edit</span>}
                  </span>
                )}
                <div
                  onMouseDown={e => onResizeMouseDown(e, el.id)}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, cursor: 'se-resize', background: 'var(--sapList_BorderColor)', borderRadius: '2px 0 0 0', zIndex: 10 }}
                />
              </div>
            )
          })}

        </div>
      </div>
    </div>
  )
}
