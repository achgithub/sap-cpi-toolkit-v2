import { useState, type ReactNode } from 'react'
import { Button, SideNavigation, SideNavigationItem } from '@ui5/webcomponents-react'

export interface PhaseNavItem {
  id: string
  label: string
  icon: string
}

interface Props {
  storageKey: string
  items: PhaseNavItem[]
  onTabChange?: (id: string) => void
  children: (activeId: string, setActiveId: (id: string) => void) => ReactNode
}

export default function PhaseLayout({ storageKey, items, onTabChange, children }: Props) {
  const collapseKey = storageKey + '-collapsed'
  const [activeId,  setActiveId]  = useState(localStorage.getItem(storageKey) ?? items[0]?.id ?? '')
  const [collapsed, setCollapsed] = useState(localStorage.getItem(collapseKey) === 'true')

  function select(id: string) {
    setActiveId(id)
    localStorage.setItem(storageKey, id)
    onTabChange?.(id)
  }

  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem(collapseKey, String(!c))
      return !c
    })
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: '1px solid var(--sapList_BorderColor)', height: '100%' }}>
        <SideNavigation
          collapsed={collapsed}
          style={{ flex: 1 }}
          onSelectionChange={(e) => {
            const id = (e.detail.item as HTMLElement).dataset.id
            if (id) select(id)
          }}
        >
          {items.map(item => (
            <SideNavigationItem
              key={item.id}
              data-id={item.id}
              text={item.label}
              icon={item.icon}
              selected={activeId === item.id}
            />
          ))}
        </SideNavigation>
        <Button
          icon={collapsed ? 'open-command-field' : 'close-command-field'}
          design="Transparent"
          onClick={toggleCollapsed}
          tooltip={collapsed ? 'Expand' : 'Collapse'}
          style={{ borderTop: '1px solid var(--sapList_BorderColor)', borderRadius: 0 }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children(activeId, select)}
      </div>

    </div>
  )
}
