import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../../context/WorkspaceContext'
import { useRegistryData } from './useRegistryData'
import DiagramCanvas from './DiagramCanvas'
import RegistryPanel from './RegistryPanel'
import InterfaceDetail from './InterfaceDetail'
import DiagramFilters, { type DiagramFilter, emptyFilter, isFilterEmpty } from './DiagramFilters'

export default function DiagramView() {
  const { selectedProject } = useWorkspace()

  if (!selectedProject) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 2rem', gap: '0.75rem' }}>
        <span style={{ fontFamily: 'var(--sapFontHeaderFamily)', fontSize: 'var(--sapFontHeader3Size)', color: 'var(--sapTextColor)' }}>
          No project selected
        </span>
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
          Select a project from the Projects tab to view its interface diagram.
        </span>
      </div>
    )
  }

  return <DiagramInner projectId={selectedProject.id} />
}

function DiagramInner({ projectId }: { projectId: string }) {
  const data = useRegistryData(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter,     setFilter]     = useState<DiagramFilter>(emptyFilter)

  useEffect(() => {
    data.loadConfig()
    data.load()
  }, [projectId])

  // Reset filter when project changes
  useEffect(() => { setFilter(emptyFilter()) }, [projectId])

  // ── Apply filters ───────────────────────────────────────────────────────────
  const { filteredSystems, filteredInterfaces } = useMemo(() => {
    let ifaces = data.interfaces

    if (filter.statuses.length)
      ifaces = ifaces.filter(i => filter.statuses.includes(i.status))
    if (filter.ifaceTypes.length)
      ifaces = ifaces.filter(i => filter.ifaceTypes.includes(i.interface_type))
    if (filter.platforms.length)
      ifaces = ifaces.filter(i => filter.platforms.length === 0 || filter.platforms.includes(i.integration_platform))
    if (filter.systems.length) {
      ifaces = ifaces.filter(iface => {
        const senderOk   = iface.sender_system_id ? filter.systems.includes(iface.sender_system_id) : false
        const receiverOk = iface.receivers.some(r => r.system_id ? filter.systems.includes(r.system_id) : false)
        return senderOk || receiverOk
      })
    }

    // Only show systems that participate in filtered interfaces
    // (when no filter active, show all)
    let systems = data.systems
    if (!isFilterEmpty(filter)) {
      const usedIds = new Set<string>()
      ifaces.forEach(iface => {
        if (iface.sender_system_id) usedIds.add(iface.sender_system_id)
        iface.receivers.forEach(r => { if (r.system_id) usedIds.add(r.system_id) })
      })
      systems = data.systems.filter(s => usedIds.has(s.id))
    }

    return { filteredSystems: systems, filteredInterfaces: ifaces }
  }, [data.systems, data.interfaces, filter])

  const selectedIface = selectedId ? data.interfaces.find(i => i.id === selectedId) ?? null : null
  const detailWidth   = selectedIface ? 360 : 0

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left column: filter bar + canvas */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <DiagramFilters
          systems={data.systems}
          config={data.config}
          filter={filter}
          onChange={setFilter}
        />

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {data.loading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.6)',
              fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapTextColor)',
            }}>
              Loading…
            </div>
          )}
          {data.error && (
            <div style={{
              position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10,
              background: 'var(--sapNegativeBackground)', color: '#fff',
              padding: '6px 16px', borderRadius: '4px',
              fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
            }}>
              {data.error}
            </div>
          )}
          <DiagramCanvas
            projectId={projectId}
            systems={filteredSystems}
            interfaces={filteredInterfaces}
            config={data.config}
            selectedIfaceId={selectedId}
            onSelectIface={setSelectedId}
            onNodeMoved={data.updateSystemPos}
          />
        </div>
      </div>

      {/* Registry panel — always shows all interfaces, not filtered */}
      <div style={{ width: '260px', flexShrink: 0, borderLeft: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_ContentBackground)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <RegistryPanel
          systems={data.systems}
          interfaces={data.interfaces}
          config={data.config}
          selectedId={selectedId}
          onSelect={id => setSelectedId(prev => prev === id ? null : id)}
          onCreateSystem={data.createSystem}
          onUpdateSystem={data.updateSystem}
          onCreateInterface={data.createInterface}
          onDeleteSystem={data.deleteSystem}
        />
      </div>

      {/* Detail panel */}
      <div style={{ width: `${detailWidth}px`, flexShrink: 0, borderLeft: detailWidth > 0 ? '1px solid var(--sapList_BorderColor)' : 'none', background: 'var(--sapGroup_ContentBackground)', overflow: 'hidden', transition: 'width 200ms ease' }}>
        {selectedIface && (
          <InterfaceDetail
            key={selectedIface.id}
            iface={selectedIface}
            systems={data.systems}
            config={data.config}
            onUpdate={body => data.updateInterface(selectedIface.id, body)}
            onDelete={async () => { await data.deleteInterface(selectedIface.id); setSelectedId(null) }}
            onAddReceiver={body => data.addReceiver(selectedIface.id, body)}
            onUpdateReceiver={(rid, body) => data.updateReceiver(selectedIface.id, rid, body)}
            onDeleteReceiver={rid => data.deleteReceiver(selectedIface.id, rid)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
