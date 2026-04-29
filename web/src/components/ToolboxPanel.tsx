import { Button, Icon } from '@ui5/webcomponents-react'
import { useClipboard, type ClipboardEntry } from '../context/WorkspaceContext'

export type ToolID = 'formatter' | 'groovy' | 'sftp' | 'http-client' | 'mock-server' | 'edi' | 'security' | 'assets'

interface Tool {
  id: ToolID
  icon: string
  name: string
  description: string
  image: string
  available: boolean
}

const TOOLS: Tool[] = [
  { id: 'assets',       icon: 'folder',           name: 'Asset Library',         description: 'Browse & manage saved assets',  image: 'api',           available: true  },
  { id: 'formatter',    icon: 'syntax',           name: 'Formatter',             description: 'XML & JSON formatting',         image: 'api',           available: true  },
  { id: 'groovy',       icon: 'source-code',      name: 'Groovy IDE + Runner',   description: 'Script editor & execution',     image: 'groovy-runner', available: true  },
  { id: 'sftp',         icon: 'upload-to-cloud',  name: 'SFTP Server',           description: 'SFTP simulator',                image: 'sftp-server',   available: true  },
  { id: 'http-client',  icon: 'internet-browser', name: 'HTTP Client',           description: 'Test HTTP endpoints',           image: 'http-tools',    available: true  },
  { id: 'mock-server',  icon: 'simulate',         name: 'HTTP Mock Server',      description: 'Intercept & respond',           image: 'http-tools',    available: true  },
  { id: 'edi',          icon: 'documents',        name: 'EDI Tools',             description: 'EDIFACT & ANSI X12',            image: 'api',           available: false },
  { id: 'security',     icon: 'locked',           name: 'Security',              description: 'Auth headers, PGP, SSH, certs', image: 'api',           available: true  },
]

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

// Fixed height so the tools list never shifts — 210px total
const SECTION_HEIGHT = 140

function ClipboardSection() {
  const { clipboard, promoteClipboard, clearClipboard } = useClipboard()
  const active  = clipboard[0] ?? null
  const history = clipboard.slice(1)

  return (
    <div style={{
      height: `${SECTION_HEIGHT}px`, flexShrink: 0, width: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
      borderBottom: '1px solid var(--sapList_BorderColor)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.375rem 1rem',
        background: 'var(--sapGroup_TitleBackground)',
        borderBottom: '1px solid var(--sapList_BorderColor)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <Icon name="copy" style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }} />
          <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--sapTextColor)' }}>
            Clipboard
          </span>
          {clipboard.length > 0 && (
            <span style={{
              fontSize: '0.68rem', fontWeight: 700,
              background: 'var(--sapHighlightColor)', color: '#fff',
              borderRadius: '8px', padding: '0 0.35rem', lineHeight: '1.4',
            }}>
              {clipboard.length}
            </span>
          )}
        </div>
        {clipboard.length > 0 && (
          <Button design="Transparent" onClick={clearClipboard}
            style={{ fontSize: '0.75rem', height: '1.5rem', padding: '0 0.4rem' }}>
            Clear all
          </Button>
        )}
      </div>

      {/* Active entry — always occupies space */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--sapList_BorderColor)' }}>
        {active ? (
          <ClipboardRow entry={active} active onPromote={() => {}} />
        ) : (
          <div style={{
            padding: '0.5rem 1rem',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem',
            color: 'var(--sapContent_LabelColor)', fontStyle: 'italic',
          }}>
            Nothing copied yet
          </div>
        )}
      </div>

      {/* History — scrollable, fills remaining height */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {history.length > 0 && (
          <div style={{
            padding: '0.2rem 1rem 0.1rem',
            fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem',
            fontWeight: 600, color: 'var(--sapContent_LabelColor)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            background: 'var(--sapGroup_TitleBackground)',
            borderBottom: '1px solid var(--sapList_BorderColor)',
          }}>
            History
          </div>
        )}
        {history.map(entry => (
          <ClipboardRow
            key={entry.id}
            entry={entry}
            active={false}
            onPromote={() => promoteClipboard(entry.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ClipboardRow({ entry, active, onPromote }: {
  entry: ClipboardEntry
  active: boolean
  onPromote: () => void
}) {
  const preview = entry.content.replace(/\s+/g, ' ').trim().slice(0, 60)

  return (
    <div
      onClick={onPromote}
      title={active ? 'Active — click to re-promote' : 'Click to make active'}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '0.4rem 1rem',
        borderBottom: '1px solid var(--sapList_BorderColor)',
        cursor: 'pointer',
        background: active ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = active
          ? 'var(--sapList_SelectionBackgroundColor)'
          : 'transparent'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem',
          fontWeight: active ? 600 : 400,
          color: 'var(--sapTextColor)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {active && <span style={{ color: 'var(--sapHighlightColor)', marginRight: '0.25rem' }}>▶</span>}
          {entry.name}
        </span>
        <span style={{
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.7rem',
          color: 'var(--sapContent_LabelColor)', flexShrink: 0, marginLeft: '0.25rem',
        }}>
          {relTime(entry.timestamp)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.1rem' }}>
        <span style={{
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.68rem',
          color: 'var(--sapContent_LabelColor)',
          background: 'var(--sapNeutralBackground)',
          border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '3px', padding: '0 0.3rem', flexShrink: 0,
        }}>
          {entry.source}
        </span>
        <span style={{
          fontFamily: 'monospace', fontSize: '0.7rem',
          color: 'var(--sapContent_LabelColor)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {preview}
        </span>
      </div>
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  onOpenTool: (id: ToolID) => void
}

export default function ToolboxPanel({ open, onClose, onOpenTool }: Props) {
  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '300px',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s ease-in-out',
        background: 'var(--sapGroup_ContentBackground)',
        borderLeft: '1px solid var(--sapList_BorderColor)',
        boxShadow: open ? '-4px 0 16px rgba(0,0,0,0.12)' : 'none',
        zIndex: 100, display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Panel header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.625rem 1rem',
        borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)',
      }}>
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>
          Toolbox
        </span>
        <Button icon="decline" design="Transparent" onClick={onClose} />
      </div>

      {/* Clipboard history */}
      <ClipboardSection />

      {/* Tools list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{
          padding: '0.375rem 1rem 0.25rem',
          fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem',
          fontWeight: 600, color: 'var(--sapContent_LabelColor)',
          background: 'var(--sapGroup_TitleBackground)',
          borderBottom: '1px solid var(--sapList_BorderColor)',
        }}>
          Tools
        </div>
        {TOOLS.map(tool => (
          <div
            key={tool.id}
            onClick={() => { if (tool.available) { onClose(); onOpenTool(tool.id) } }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--sapList_BorderColor)',
              opacity: tool.available ? 1 : 0.45,
              cursor: tool.available ? 'pointer' : 'default',
              background: 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (tool.available) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
          >
            <div style={{
              width: '2rem', height: '2rem', borderRadius: '4px', flexShrink: 0,
              background: 'var(--sapButton_Background)', border: '1px solid var(--sapButton_BorderColor)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={tool.icon} style={{ fontSize: '1rem' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tool.name}
              </div>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
                {tool.description}
              </div>
            </div>
            {tool.available && <Icon name="navigation-right-arrow" style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }} />}
          </div>
        ))}
      </div>

      <div style={{ padding: '0.625rem 1rem', borderTop: '1px solid var(--sapList_BorderColor)', fontFamily: 'var(--sapFontFamily)', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center' }}>
        More tools coming in Step 2
      </div>
    </div>
  )
}
