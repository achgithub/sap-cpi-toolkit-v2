import type { IFInterface } from './types'
import { STATUS_COLORS, TYPE_LABELS } from './types'

interface Props {
  interfaces: IFInterface[]
  selectedId: string | null
  onSelect:   (id: string) => void
}

export default function InterfaceListPanel({ interfaces, selectedId, onSelect }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
        fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--sapTextColor)',
      }}>
        Interfaces ({interfaces.length})
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {interfaces.length === 0 && (
          <div style={{ padding: '1rem', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center' }}>
            No interfaces
          </div>
        )}
        {interfaces.map(iface => (
          <div
            key={iface.id}
            onClick={() => onSelect(iface.id)}
            style={{
              padding: '8px 12px', cursor: 'pointer',
              borderBottom: '1px solid var(--sapList_BorderColor)',
              background: selectedId === iface.id ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
            onMouseEnter={e => {
              if (selectedId !== iface.id)
                (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.background =
                selectedId === iface.id ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent'
            }}
          >
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
              background: STATUS_COLORS[iface.status] ?? '#888',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapTextColor)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {iface.name}
              </div>
              {iface.interface_ref && (
                <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)' }}>
                  {iface.interface_ref}
                </div>
              )}
            </div>
            <span style={{
              padding: '1px 5px', borderRadius: '8px', fontSize: '0.65rem',
              background: 'var(--sapHighlightColor)', color: '#fff',
              flexShrink: 0, fontFamily: 'var(--sapFontFamily)',
            }}>
              {TYPE_LABELS[iface.interface_type]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
