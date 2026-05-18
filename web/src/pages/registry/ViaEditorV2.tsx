import { useState } from 'react'
import { Button } from '@ui5/webcomponents-react'
import type { HopV2, APICallout, Component } from './types_v2'
import type { System } from './types'

const ns: React.CSSProperties = {
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
  border: '1px solid var(--sapList_BorderColor)', borderRadius: 4,
  padding: '4px 6px', background: 'var(--sapField_Background)', color: 'var(--sapTextColor)',
  boxSizing: 'border-box', width: '100%',
}

// ── Callout row ───────────────────────────────────────────────────────────────

function CalloutRow({ callout, systems, onChange, onRemove }: {
  callout:  APICallout
  systems:  System[]
  onChange: (c: APICallout) => void
  onRemove: () => void
}) {
  const [editing,   setEditing]   = useState(false)
  const [label,     setLabel]     = useState(callout.label)
  const [systemId,  setSystemId]  = useState(callout.system_id ?? '')

  function commit() {
    if (!label.trim()) return
    const sys = systems.find(s => s.id === systemId)
    onChange({ label: label.trim(), system_id: systemId || undefined, system_label: sys?.name })
    setEditing(false)
  }

  function cancel() {
    setLabel(callout.label)
    setSystemId(callout.system_id ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--sapWarningColor)', background: 'var(--sapGroup_ContentBackground)', marginLeft: 16 }}>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="What does this call do?"
          style={ns}
          autoFocus
        />
        <select value={systemId} onChange={e => setSystemId(e.target.value)} style={ns}>
          <option value="">— system being called (optional) —</option>
          {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button design="Emphasized" onClick={commit} disabled={!label.trim()}>Save</Button>
          <Button design="Transparent" onClick={cancel}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginLeft: 16, padding: '3px 0' }}>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.65rem', fontWeight: 600, padding: '1px 5px', borderRadius: 8, background: 'var(--sapWarningColor)', color: '#fff', flexShrink: 0, marginTop: 3 }}>
        API
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)' }}>{callout.label}</div>
        {callout.system_label && (
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
            → {callout.system_label}
          </div>
        )}
      </div>
      <Button design="Transparent" icon="edit"    onClick={() => setEditing(true)} />
      <Button design="Transparent" icon="decline" onClick={onRemove} />
    </div>
  )
}

// ── Hop row ───────────────────────────────────────────────────────────────────

function HopRow({ hop, index, total, components, systems, allowCallouts, onChange, onRemove, onMove }: {
  hop:           HopV2
  index:         number
  total:         number
  components:    Component[]
  systems:       System[]
  allowCallouts: boolean
  onChange:      (h: HopV2) => void
  onRemove:      () => void
  onMove:        (dir: -1 | 1) => void
}) {
  const [expanded,   setExpanded]   = useState(false)
  const [editingHop, setEditingHop] = useState(false)
  const [pickComp,   setPickComp]   = useState(hop.component_id ?? '')
  const [addingCall, setAddingCall] = useState(false)
  const [callLabel,  setCallLabel]  = useState('')
  const [callSys,    setCallSys]    = useState('')

  const callouts = hop.callouts ?? []

  function commitHopEdit() {
    const comp = components.find(c => c.id === pickComp)
    if (!comp) { setEditingHop(false); return }
    onChange({ ...hop, label: comp.name, component_id: comp.id })
    setEditingHop(false)
  }

  function addCallout() {
    if (!callLabel.trim()) return
    const sys = systems.find(s => s.id === callSys)
    onChange({ ...hop, callouts: [...callouts, { label: callLabel.trim(), system_id: callSys || undefined, system_label: sys?.name }] })
    setCallLabel(''); setCallSys(''); setAddingCall(false)
  }

  function updateCallout(i: number, c: APICallout) {
    onChange({ ...hop, callouts: callouts.map((x, j) => j === i ? c : x) })
  }

  function removeCallout(i: number) {
    onChange({ ...hop, callouts: callouts.filter((_, j) => j !== i) })
  }

  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: 4, overflow: 'hidden' }}>
      {/* Hop header */}
      {editingHop ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px', background: 'var(--sapGroup_TitleBackground)' }}>
          <select value={pickComp} onChange={e => setPickComp(e.target.value)} style={{ ...ns, flex: 1 }}>
            <option value="">— select component —</option>
            {components.map(c => <option key={c.id} value={c.id}>{c.name} ({c.component_type})</option>)}
          </select>
          <Button design="Transparent" icon="accept"  onClick={commitHopEdit} disabled={!pickComp} />
          <Button design="Transparent" icon="decline" onClick={() => { setPickComp(hop.component_id ?? ''); setEditingHop(false) }} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'var(--sapGroup_TitleBackground)' }}>
          <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: 'var(--sapHighlightColor)', color: '#fff', flexShrink: 0 }}>
            HOP
          </span>
          <span style={{ flex: 1, fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', fontWeight: 600 }}>
            {hop.label}
          </span>
          {callouts.length > 0 && (
            <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)' }}>
              {callouts.length} API call{callouts.length !== 1 ? 's' : ''}
            </span>
          )}
          <Button design="Transparent" icon="edit" onClick={() => { setPickComp(hop.component_id ?? ''); setEditingHop(true) }} />
          {allowCallouts && (
            <Button design="Transparent" icon={expanded ? 'navigation-up-arrow' : 'navigation-down-arrow'}
              onClick={() => setExpanded(p => !p)} title="API callouts" />
          )}
          <Button design="Transparent" icon="navigation-up-arrow"   onClick={() => onMove(-1)} disabled={index === 0} />
          <Button design="Transparent" icon="navigation-down-arrow" onClick={() => onMove(1)}  disabled={index === total - 1} />
          <Button design="Transparent" icon="decline" onClick={onRemove} />
        </div>
      )}

      {/* Callouts */}
      {allowCallouts && expanded && (
        <div style={{ padding: '8px 10px', background: 'var(--sapGroup_ContentBackground)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginBottom: 2 }}>
            API calls made by <strong>{hop.label}</strong> during processing
          </div>

          {callouts.length === 0 && !addingCall && (
            <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', paddingLeft: 16 }}>No callouts.</div>
          )}

          {callouts.map((c, i) => (
            <CalloutRow
              key={i}
              callout={c}
              systems={systems}
              onChange={updated => updateCallout(i, updated)}
              onRemove={() => removeCallout(i)}
            />
          ))}

          {addingCall ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 8px', borderRadius: 4, border: '1px dashed var(--sapWarningColor)', marginLeft: 16 }}>
              <input
                placeholder="What does this call do? e.g. Map Customer Number"
                value={callLabel}
                onChange={e => setCallLabel(e.target.value)}
                style={ns}
                autoFocus
              />
              <select value={callSys} onChange={e => setCallSys(e.target.value)} style={ns}>
                <option value="">— system being called (optional) —</option>
                {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button design="Emphasized" onClick={addCallout} disabled={!callLabel.trim()}>Add</Button>
                <Button design="Transparent" onClick={() => { setCallLabel(''); setCallSys(''); setAddingCall(false) }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button design="Transparent" icon="add" onClick={() => setAddingCall(true)}>Add API Callout</Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface Props {
  value:         HopV2[]
  onChange:      (v: HopV2[]) => void
  components:    Component[]
  systems:       System[]
  allowCallouts?: boolean
}

export default function ViaEditorV2({ value, onChange, components, systems, allowCallouts = false }: Props) {
  const [addingHop, setAddingHop] = useState(false)
  const [pickComp,  setPickComp]  = useState('')

  function addHop() {
    const comp = components.find(c => c.id === pickComp)
    if (!comp) return
    onChange([...value, { type: 'component', label: comp.name, component_id: comp.id, callouts: [] }])
    setPickComp(''); setAddingHop(false)
  }

  function updateHop(i: number, hop: HopV2) { onChange(value.map((h, j) => j === i ? hop : h)) }
  function removeHop(i: number)              { onChange(value.filter((_, j) => j !== i)) }
  function moveHop(i: number, dir: -1 | 1)  {
    const next = [...value]
    const swap = i + dir
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]]
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value.length === 0 && !addingHop && (
        <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', padding: '2px 0' }}>
          No hops yet.
        </div>
      )}

      {value.map((hop, i) => (
        <HopRow
          key={i}
          hop={hop}
          index={i}
          total={value.length}
          components={components}
          systems={systems}
          allowCallouts={allowCallouts}
          onChange={h => updateHop(i, h)}
          onRemove={() => removeHop(i)}
          onMove={dir => moveHop(i, dir)}
        />
      ))}

      {addingHop ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 4, border: '1px dashed var(--sapHighlightColor)', background: 'var(--sapGroup_ContentBackground)' }}>
          <select value={pickComp} onChange={e => setPickComp(e.target.value)} style={{ ...ns, flex: 1 }}>
            <option value="">— select integration component —</option>
            {components.map(c => <option key={c.id} value={c.id}>{c.name} ({c.component_type})</option>)}
          </select>
          <Button design="Emphasized" onClick={addHop} disabled={!pickComp}>Add</Button>
          <Button design="Transparent" onClick={() => { setPickComp(''); setAddingHop(false) }}>Cancel</Button>
        </div>
      ) : (
        <Button design="Transparent" icon="add" onClick={() => setAddingHop(true)}>
          Add Component Hop
        </Button>
      )}
    </div>
  )
}
