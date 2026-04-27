import { Button, Icon } from '@ui5/webcomponents-react'

export type ToolID = 'formatter' | 'groovy' | 'sftp' | 'http-client' | 'mock-server' | 'edi' | 'security'

interface Tool {
  id: ToolID
  icon: string
  name: string
  description: string
  image: string
  available: boolean
}

const TOOLS: Tool[] = [
  { id: 'formatter',    icon: 'syntax',           name: 'Formatter',             description: 'XML & JSON formatting',      image: 'api',          available: true  },
  { id: 'groovy',       icon: 'source-code',      name: 'Groovy IDE + Runner',   description: 'Script editor & execution',  image: 'groovy-runner',available: false },
  { id: 'sftp',         icon: 'upload-to-cloud',  name: 'SFTP Server',           description: 'SFTP simulator',             image: 'sftp-adapter', available: false },
  { id: 'http-client',  icon: 'internet-browser', name: 'HTTP Client',           description: 'Test HTTP endpoints',        image: 'http-tools',   available: false },
  { id: 'mock-server',  icon: 'simulate',         name: 'HTTP Mock Server',      description: 'Intercept & respond',        image: 'http-tools',   available: false },
  { id: 'edi',          icon: 'documents',        name: 'EDI Tools',             description: 'EDIFACT & ANSI X12',         image: 'api',          available: false },
  { id: 'security',     icon: 'locked',           name: 'Security',              description: 'Auth headers, PGP, SSH, certs', image: 'api',     available: true  },
]

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

      <div style={{ flex: 1, overflowY: 'auto' }}>
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
