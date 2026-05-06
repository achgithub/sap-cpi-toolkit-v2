import { useEffect, useState } from 'react'
import { useWorkspace } from '../../../context/WorkspaceContext'
import { useRegistryData } from './useRegistryData'
import InterfaceListPanel from './InterfaceListPanel'
import InterfaceCanvas from './InterfaceCanvas'

export default function InterfaceView() {
  const { selectedProject } = useWorkspace()

  if (!selectedProject) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 2rem', gap: '0.75rem' }}>
        <span style={{ fontFamily: 'var(--sapFontHeaderFamily)', fontSize: 'var(--sapFontHeader3Size)', color: 'var(--sapTextColor)' }}>
          No project selected
        </span>
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
          Select a project from the Projects tab to view its interfaces.
        </span>
      </div>
    )
  }

  return <InterfaceViewInner projectId={selectedProject.id} />
}

function InterfaceViewInner({ projectId }: { projectId: string }) {
  const data = useRegistryData(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    data.load()
    data.loadConfig()
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIface = selectedId ? data.interfaces.find(i => i.id === selectedId) ?? null : null

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Interface list */}
      <div style={{ width: '260px', flexShrink: 0, borderRight: '1px solid var(--sapList_BorderColor)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <InterfaceListPanel
          interfaces={data.interfaces}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {selectedIface ? (
          <InterfaceCanvas
            key={selectedIface.id}
            iface={selectedIface}
            systems={data.systems}
            config={data.config}
            listCanvasElements={() => data.listCanvasElements(selectedIface.id)}
            addCanvasElement={body => data.addCanvasElement(selectedIface.id, body)}
            updateCanvasElement={(eid, body) => data.updateCanvasElement(selectedIface.id, eid, body)}
            deleteCanvasElement={eid => data.deleteCanvasElement(selectedIface.id, eid)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
            Select an interface from the list
          </div>
        )}
      </div>

    </div>
  )
}
