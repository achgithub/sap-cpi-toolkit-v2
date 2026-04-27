import { useState } from 'react'
import {
  ShellBar,
  Avatar,
  TabContainer,
  Tab,
  FlexBox,
  FlexBoxDirection,
  Button,
} from '@ui5/webcomponents-react'
import DesignPhase from './pages/design/DesignPhase'
import DevelopPhase from './pages/develop/DevelopPhase'
import TestPhase from './pages/test/TestPhase'
import MonitoringPhase from './pages/monitoring/MonitoringPhase'
import ToolboxPanel, { type ToolID } from './components/ToolboxPanel'
import SettingsDialog from './components/SettingsDialog'
import ContextBar from './components/ContextBar'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { Dialog, Bar, Button as Btn } from '@ui5/webcomponents-react'
import Formatter from './tools/Formatter'
import AuthHeaderGen from './tools/AuthHeaderGen'
import KeyCertGen from './tools/KeyCertGen'

type Phase = 'design' | 'develop' | 'test' | 'monitoring'
const PHASES: Phase[] = ['design', 'develop', 'test', 'monitoring']

export default function App() {
  const [phase, setPhase] = useState<Phase>('design')
  const [toolboxOpen, setToolboxOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeTool,  setActiveTool]  = useState<ToolID | null>(null)
  const [maximized,   setMaximized]   = useState(false)

  function openTool(id: ToolID) { setActiveTool(id); setMaximized(false) }
  function closeTool()           { setActiveTool(null); setMaximized(false) }

  return (
    <WorkspaceProvider>
    <FlexBox direction={FlexBoxDirection.Column} style={{ height: '100vh', overflow: 'hidden' }}>

      <ShellBar
        primaryTitle="SAP CPI Toolkit"
        secondaryTitle="v2"
        logo={
          <img
            alt="SAP"
            src="https://www.sap.com/dam/application/shared/logos/sap-logo-svg.svg"
            style={{ height: '1.5rem' }}
          />
        }
        onProfileClick={() => setSettingsOpen(true)}
        accessibilityAttributes={{ profile: { name: 'Settings' } }}
      >
        <Avatar slot="profile" icon="action-settings" accessibleName="Settings" />
      </ShellBar>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Sub-header: project context placeholder + Toolbox trigger */}
      <FlexBox
        style={{
          padding: '0.375rem 1rem',
          gap: '0.75rem',
          borderBottom: '1px solid var(--sapList_BorderColor)',
          background: 'var(--sapGroup_TitleBackground)',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '2.25rem',
        }}
      >
        <ContextBar />
        <Button
          icon="wrench"
          design="Transparent"
          onClick={() => setToolboxOpen(true)}
        >
          Toolbox
        </Button>
      </FlexBox>

      <TabContainer
        onTabSelect={(e) => {
          // UI5 TabContainer fires tabIndex in the event detail
          const idx = (e.detail as unknown as { tabIndex: number }).tabIndex
          setPhase(PHASES[idx] ?? 'design')
        }}
        style={{ borderBottom: '1px solid var(--sapList_BorderColor)' }}
      >
        <Tab text="Design" selected={phase === 'design'} />
        <Tab text="Develop" selected={phase === 'develop'} />
        <Tab text="Test" selected={phase === 'test'} />
        <Tab text="Monitoring" selected={phase === 'monitoring'} />
      </TabContainer>

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--sapBackgroundColor)' }}>
        {phase === 'design'     && <DesignPhase />}
        {phase === 'develop'    && <DevelopPhase />}
        {phase === 'test'       && <TestPhase />}
        {phase === 'monitoring' && <MonitoringPhase />}
      </div>

      <ToolboxPanel
        open={toolboxOpen}
        onClose={() => setToolboxOpen(false)}
        onOpenTool={(id) => openTool(id)}
      />

      {/* Tool overlays */}
      <Dialog
        open={activeTool === 'formatter'}
        headerText="Formatter"
        stretch={maximized}
        style={maximized ? undefined : { width: '92vw', height: '92vh' }}
        onClose={closeTool}
      >
        <Formatter />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'auth-header'}
        headerText="Auth Header Generator"
        stretch={maximized}
        style={maximized ? undefined : { width: '60vw', height: '80vh' }}
        onClose={closeTool}
      >
        <AuthHeaderGen />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'keygen'}
        headerText="Key / Cert Generator"
        stretch={maximized}
        style={maximized ? undefined : { width: '70vw', height: '85vh' }}
        onClose={closeTool}
      >
        <KeyCertGen />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

    </FlexBox>
    </WorkspaceProvider>
  )
}
