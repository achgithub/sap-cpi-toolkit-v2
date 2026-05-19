import { useState } from 'react'
import {
  ShellBar, Avatar, FlexBox, FlexBoxDirection,
  Button, Dialog, Bar,
} from '@ui5/webcomponents-react'
import DesignPhase from './pages/design/DesignPhase'
import DevelopPhase from './pages/develop/DevelopPhase'
import TestPhase from './pages/test/TestPhase'
import MonitoringPhase from './pages/monitoring/MonitoringPhase'
import ToolboxPanel, { type ToolID } from './components/ToolboxPanel'
import SettingsDialog from './components/SettingsDialog'
import ContextBar from './components/ContextBar'
import { WorkspaceProvider, useClipboard } from './context/WorkspaceContext'
import Formatter from './tools/Formatter'
import Security from './tools/Security'
import GroovyIDE from './tools/GroovyIDE'
import HttpClient from './tools/HttpClient'
import AssetLibrary from './tools/AssetLibrary'
import GlobalAdapterTemplates from './tools/GlobalAdapterTemplates'
import RegistrySettings from './tools/RegistrySettings'
import CloudConnector from './tools/CloudConnector'
import EDITools from './tools/EDITools'
import MockServer from './tools/MockServer'
import SFTPServer from './tools/SFTPServer'
import Comparator from './tools/Comparator'
// Logo served as a static asset from public/ — no import needed, no TypeScript SVG module required.
const SAP_LOGO_URL = '/sap-logo.svg'

type Phase = 'design' | 'develop' | 'test' | 'monitoring'

// ── ToolDialog ────────────────────────────────────────────────────────────────
// Shared wrapper for all Toolbox tool overlays. Extracted to eliminate 12
// near-identical Dialog blocks and fix the shared-maximized-state bug
// (previously a single boolean toggled all tools at once).

interface ToolDialogProps {
  id:               ToolID
  activeTool:       ToolID | null
  maximizedTool:    ToolID | null
  title:            string
  defaultWidth?:    string
  defaultHeight?:   string
  fullScreen?:      boolean
  onClose:          () => void
  onToggleMaximize: (id: ToolID) => void
  children:         React.ReactNode
}

function ToolDialog({
  id, activeTool, maximizedTool, title,
  defaultWidth, defaultHeight, fullScreen,
  onClose, onToggleMaximize, children,
}: ToolDialogProps) {
  const isMaximized = !fullScreen && maximizedTool === id
  return (
    <Dialog
      open={activeTool === id}
      headerText={title}
      stretch={isMaximized || !!fullScreen}
      style={(!isMaximized && !fullScreen) ? { width: defaultWidth, height: defaultHeight } : undefined}
      onClose={onClose}
    >
      {children}
      <Bar slot="footer">
        {!fullScreen && (
          <Button
            slot="startContent"
            design="Transparent"
            icon={isMaximized ? 'exit-full-screen' : 'full-screen'}
            onClick={() => onToggleMaximize(id)}
          >
            {isMaximized ? 'Restore' : 'Maximise'}
          </Button>
        )}
        <Button slot="endContent" design="Transparent" onClick={onClose}>Close</Button>
      </Bar>
    </Dialog>
  )
}

// ── ClipboardBadge ────────────────────────────────────────────────────────────

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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [phase,         setPhase]         = useState<Phase>('design')
  const [toolboxOpen,   setToolboxOpen]   = useState(false)
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [activeTool,    setActiveTool]    = useState<ToolID | null>(null)
  const [maximizedTool, setMaximizedTool] = useState<ToolID | null>(null)

  function openTool(id: ToolID)          { setActiveTool(id); setMaximizedTool(null) }
  function closeTool()                   { setActiveTool(null); setMaximizedTool(null) }
  function toggleMaximize(id: ToolID)    { setMaximizedTool(t => t === id ? null : id) }

  // Spread onto every ToolDialog to avoid repeating the four shared props.
  const tdProps = { activeTool, maximizedTool, onClose: closeTool, onToggleMaximize: toggleMaximize }

  return (
    <WorkspaceProvider>
    <FlexBox direction={FlexBoxDirection.Column} style={{ height: '100vh', overflow: 'hidden' }}>

      <ShellBar
        primaryTitle="SAP CPI Toolkit"
        secondaryTitle="v2"
        logo={<img alt="SAP" src={SAP_LOGO_URL} style={{ height: '1.5rem' }} />}
        onProfileClick={() => setSettingsOpen(true)}
        accessibilityAttributes={{ profile: { name: 'Settings' } }}
      >
        <Avatar slot="profile" icon="action-settings" accessibleName="Settings" />
      </ShellBar>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Tab bar + context bar merged */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '2px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)',
        padding: '0 1rem',
        flexShrink: 0,
      }}>
        {(['design', 'develop', 'test', 'monitoring'] as Phase[]).map(p => (
          <div key={p} style={{
            borderBottom: phase === p ? '2px solid var(--sapHighlightColor)' : '2px solid transparent',
            marginBottom: '-2px',
            display: 'flex',
          }}>
            <Button
              design="Transparent"
              onClick={() => setPhase(p)}
              style={{
                borderRadius: 0,
                fontWeight: phase === p ? 600 : 400,
                color: phase === p ? 'var(--sapHighlightColor)' : 'var(--sapTextColor)',
              } as React.CSSProperties}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
          <ContextBar />
          <div style={{ width: 1, height: '1.25rem', background: 'var(--sapList_BorderColor)' }} />
          <ClipboardBadge onClick={() => setToolboxOpen(true)} />
          <Button icon="wrench" design="Transparent" onClick={() => setToolboxOpen(true)}>
            Toolbox
          </Button>
        </div>
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
        onOpenTool={openTool}
      />

      {/* Tool overlays */}
      <ToolDialog {...tdProps} id="formatter"          title="Formatter"                        defaultWidth="92vw"  defaultHeight="92vh"><Formatter /></ToolDialog>
      <ToolDialog {...tdProps} id="groovy"             title="Groovy IDE"                       defaultWidth="95vw"  defaultHeight="95vh"><GroovyIDE /></ToolDialog>
      <ToolDialog {...tdProps} id="security"           title="Security"                         defaultWidth="70vw"  defaultHeight="85vh"><Security /></ToolDialog>
      <ToolDialog {...tdProps} id="sftp"               title="SFTP Server"                      fullScreen><SFTPServer /></ToolDialog>
      <ToolDialog {...tdProps} id="assets"             title="Asset Library"                    defaultWidth="90vw"  defaultHeight="90vh"><AssetLibrary /></ToolDialog>
      <ToolDialog {...tdProps} id="http-client"        title="HTTP Client"                      defaultWidth="80vw"  defaultHeight="90vh"><HttpClient /></ToolDialog>
      <ToolDialog {...tdProps} id="cloud-connector"    title="Cloud Connector"                  defaultWidth="80vw"  defaultHeight="90vh"><CloudConnector /></ToolDialog>
      <ToolDialog {...tdProps} id="edi"                title="EDI Tools"                        defaultWidth="90vw"  defaultHeight="90vh"><EDITools /></ToolDialog>
      <ToolDialog {...tdProps} id="adapter-templates"  title="Adapter Templates — Global Library" defaultWidth="90vw" defaultHeight="90vh"><GlobalAdapterTemplates /></ToolDialog>
      <ToolDialog {...tdProps} id="registry-settings"  title="Registry Settings"                defaultWidth="80vw"  defaultHeight="88vh"><RegistrySettings /></ToolDialog>
      <ToolDialog {...tdProps} id="mock-server"        title="HTTP Mock Server"                 defaultWidth="90vw"  defaultHeight="90vh"><MockServer /></ToolDialog>
      <ToolDialog {...tdProps} id="comparator"        title="Comparator"                       defaultWidth="96vw"  defaultHeight="94vh"><Comparator /></ToolDialog>

    </FlexBox>
    </WorkspaceProvider>
  )
}
