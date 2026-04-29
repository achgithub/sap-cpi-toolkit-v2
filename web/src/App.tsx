import { useState } from 'react'
import {
  ShellBar,
  Avatar,
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
import { WorkspaceProvider, useClipboard } from './context/WorkspaceContext'
import { Dialog, Bar, Button as Btn } from '@ui5/webcomponents-react'
import Formatter from './tools/Formatter'
import Security from './tools/Security'
import GroovyIDE from './tools/GroovyIDE'
import HttpClient from './tools/HttpClient'
import AssetLibrary from './tools/AssetLibrary'
import CloudConnector from './tools/CloudConnector'
import EDITools from './tools/EDITools'
import MockServer from './tools/MockServer'
import SFTPServer from './tools/SFTPServer'

type Phase = 'design' | 'develop' | 'test' | 'monitoring'


function ClipboardBadge({ onClick }: { onClick: () => void }) {
  const { clipboard } = useClipboard()
  if (!clipboard.length) return null
  return (
    <button
      onClick={onClick}
      title={`Clipboard active: ${clipboard[0].name}\nClick to open Toolbox`}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.3rem',
        background: 'var(--sapNeutralBackground)',
        border: '1px solid var(--sapList_BorderColor)',
        borderRadius: '12px', padding: '0.1rem 0.6rem 0.1rem 0.4rem',
        cursor: 'pointer', fontFamily: 'var(--sapFontFamily)',
        fontSize: '0.72rem', color: 'var(--sapTextColor)',
        maxWidth: '180px',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: 'var(--sapHighlightColor)', flexShrink: 0 }}>▶</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {clipboard[0].name}
      </span>
      {clipboard.length > 1 && (
        <span style={{
          fontSize: '0.65rem', background: 'var(--sapHighlightColor)', color: '#fff',
          borderRadius: '8px', padding: '0 0.3rem', lineHeight: '1.4', flexShrink: 0,
        }}>
          +{clipboard.length - 1}
        </span>
      )}
    </button>
  )
}

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ClipboardBadge onClick={() => setToolboxOpen(true)} />
          <Button
            icon="wrench"
            design="Transparent"
            onClick={() => setToolboxOpen(true)}
          >
            Toolbox
          </Button>
        </div>
      </FlexBox>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)',
        padding: '0 1rem',
        flexShrink: 0,
      }}>
        {(['design', 'develop', 'test', 'monitoring'] as Phase[]).map(p => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            style={{
              padding: '0.6rem 1.25rem',
              border: 'none',
              borderBottom: phase === p ? '2px solid var(--sapHighlightColor)' : '2px solid transparent',
              marginBottom: '-2px',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'var(--sapFontFamily)',
              fontSize: 'var(--sapFontSize)',
              color: phase === p ? 'var(--sapHighlightColor)' : 'var(--sapTextColor)',
              fontWeight: phase === p ? 600 : 400,
            }}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Phase content */}
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
        open={activeTool === 'groovy'}
        headerText="Groovy IDE"
        stretch={maximized}
        style={maximized ? undefined : { width: '95vw', height: '95vh' }}
        onClose={closeTool}
      >
        <GroovyIDE />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'security'}
        headerText="Security"
        stretch={maximized}
        style={maximized ? undefined : { width: '70vw', height: '85vh' }}
        onClose={closeTool}
      >
        <Security />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'sftp'}
        headerText="SFTP Server"
        stretch
        style={{ width: '100vw', height: '100vh' }}
        onClose={closeTool}
      >
        <SFTPServer />
        <Bar slot="footer">
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'assets'}
        headerText="Asset Library"
        stretch={maximized}
        style={maximized ? undefined : { width: '90vw', height: '90vh' }}
        onClose={closeTool}
      >
        <AssetLibrary />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'http-client'}
        headerText="HTTP Client"
        stretch={maximized}
        style={maximized ? undefined : { width: '80vw', height: '90vh' }}
        onClose={closeTool}
      >
        <HttpClient />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'cloud-connector'}
        headerText="Cloud Connector"
        stretch={maximized}
        style={maximized ? undefined : { width: '80vw', height: '90vh' }}
        onClose={closeTool}
      >
        <CloudConnector />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'edi'}
        headerText="EDI Tools"
        stretch={maximized}
        style={maximized ? undefined : { width: '90vw', height: '90vh' }}
        onClose={closeTool}
      >
        <EDITools />
        <Bar slot="footer">
          <Btn slot="startContent" design="Transparent" icon={maximized ? 'exit-full-screen' : 'full-screen'} onClick={() => setMaximized(m => !m)}>
            {maximized ? 'Restore' : 'Maximise'}
          </Btn>
          <Btn slot="endContent" design="Transparent" onClick={closeTool}>Close</Btn>
        </Bar>
      </Dialog>

      <Dialog
        open={activeTool === 'mock-server'}
        headerText="HTTP Mock Server"
        stretch={maximized}
        style={maximized ? undefined : { width: '90vw', height: '90vh' }}
        onClose={closeTool}
      >
        <MockServer />
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
