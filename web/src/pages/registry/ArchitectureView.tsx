import { useEffect, useState } from 'react'
import { useRegistryApi, type DiagramFilter } from './useRegistryApi'
import type { System, DiagramEdge } from './types'
import ArchitectureFilters from './ArchitectureFilters'
import ArchitectureCanvas from './ArchitectureCanvas'

interface Props {
  filter:         DiagramFilter
  onFilterChange: (f: DiagramFilter) => void
  onOpenRegistry: (senderSystemId: string, receiverSystemId: string) => void
}

export default function ArchitectureView({ filter, onFilterChange, onOpenRegistry }: Props) {
  const api = useRegistryApi()
  const [diagramSystems, setDiagramSystems] = useState<System[]>([])
  const [diagramEdges,   setDiagramEdges]   = useState<DiagramEdge[]>([])

  useEffect(() => { api.load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.loadDiagram(filter)
      .then(r => { setDiagramSystems(r.systems); setDiagramEdges(r.edges) })
      .catch(() => {})
  }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <ArchitectureFilters
        systems={api.systems}
        filter={filter}
        onChange={onFilterChange}
      />

      {api.loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
          Loading…
        </div>
      )}

      {!api.loading && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <ArchitectureCanvas
            systems={diagramSystems}
            edges={diagramEdges}
            config={api.config}
            onNodeMoved={api.updateSystemPos}
            onOpenRegistry={onOpenRegistry}
          />
        </div>
      )}
    </div>
  )
}
