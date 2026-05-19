import { useEffect, useRef, useState } from 'react'
import { useRegistryApiV2 } from './useRegistryApiV2'
import type { DiagramFilter } from './types'
import type { System, DiagramEdge, RegistryConfig, Point } from './types'
import ArchitectureFiltersV2   from './ArchitectureFiltersV2'
import ArchitectureCanvasV2    from './ArchitectureCanvasV2'
import ArchitectureInfraViewV2 from './ArchitectureInfraViewV2'

interface Props {
  filter:         DiagramFilter
  onFilterChange: (f: DiagramFilter) => void
  onOpenRegistry: (senderSystemId: string, receiverSystemId: string) => void
}

export default function ArchitectureViewV2({ filter, onFilterChange, onOpenRegistry }: Props) {
  const api = useRegistryApiV2()
  const [diagramSystems,    setDiagramSystems]    = useState<System[]>([])
  const [diagramEdges,      setDiagramEdges]      = useState<DiagramEdge[]>([])
  const [viewMode,          setViewMode]          = useState<'interface' | 'infra'>('interface')
  const [overridePositions, setOverridePositions] = useState<Record<string, Point> | null>(null)

  // Ref the canvas exposes so ArchitectureFiltersV2 can read positions when saving a view
  const posRef = useRef<Record<string, Point>>({})

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewMode !== 'interface') return
    api.loadDiagramV2(filter)
      .then(r => { setDiagramSystems(r.systems); setDiagramEdges(r.edges) })
      .catch(() => {})
  }, [filter, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const canvasConfig: RegistryConfig = {
    systemTypes: api.config.systemTypes,
    infraTypes:  api.config.infraTypes,
    platforms:   [],
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <ArchitectureFiltersV2
        systems={api.systems}
        filter={filter}
        onChange={onFilterChange}
        statusConfigs={api.config.statuses}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        posRef={posRef}
        onLoadView={(f, positions) => {
          onFilterChange(f)
          if (Object.keys(positions).length > 0) setOverridePositions(positions)
        }}
      />

      {api.loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
          Loading…
        </div>
      )}

      {!api.loading && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {viewMode === 'interface' ? (() => {
            const lsFilter = filter.lifecycleStatuses ?? []
            const lifecycleFiltered = lsFilter.length > 0
              ? diagramSystems.filter(s => lsFilter.includes(s.lifecycle_status || 'active'))
              : diagramSystems
            const survivingIds = new Set(lifecycleFiltered.map(s => s.id))
            const lifecycleEdges = lsFilter.length > 0
              ? diagramEdges.filter(e => survivingIds.has(e.sender_system_id) && survivingIds.has(e.receiver_system_id))
              : diagramEdges
            return (
            <ArchitectureCanvasV2
              systems={lifecycleFiltered}
              edges={lifecycleEdges}
              config={canvasConfig}
              statusConfigs={api.config.statuses}
              onNodeMoved={api.updateSystemPos}
              onOpenRegistry={onOpenRegistry}
              posRef={posRef}
              overridePositions={overridePositions}
            />
            )
          })() : (
            <ArchitectureInfraViewV2
              systems={api.systems}
              config={canvasConfig}
              managedByTypes={api.config.managedByTypes}
            />
          )}
        </div>
      )}
    </div>
  )
}
