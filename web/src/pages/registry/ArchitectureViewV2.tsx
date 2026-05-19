import { useEffect, useState } from 'react'
import { useRegistryApiV2 } from './useRegistryApiV2'
import type { DiagramFilter } from './types'
import type { System, DiagramEdge, RegistryConfig } from './types'
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
  const [diagramSystems, setDiagramSystems] = useState<System[]>([])
  const [diagramEdges,   setDiagramEdges]   = useState<DiagramEdge[]>([])
  const [viewMode,       setViewMode]       = useState<'interface' | 'infra'>('interface')

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
      />

      {api.loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
          Loading…
        </div>
      )}

      {!api.loading && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {viewMode === 'interface' ? (
            <ArchitectureCanvasV2
              systems={diagramSystems}
              edges={diagramEdges}
              config={canvasConfig}
              statusConfigs={api.config.statuses}
              onNodeMoved={api.updateSystemPos}
              onOpenRegistry={onOpenRegistry}
            />
          ) : (
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
