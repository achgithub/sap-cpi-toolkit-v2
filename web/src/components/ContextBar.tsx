import { Select, Option, Button } from '@ui5/webcomponents-react'
import { useWorkspace } from '../context/WorkspaceContext'

function buildSuiteURL(apiUrl: string): string | null {
  try {
    const u = new URL(apiUrl)
    const parts = u.hostname.split('.')
    const cfIdx = parts.indexOf('cfapps')
    if (cfIdx < 1) return null
    const tenant = parts[0]
    const region = parts.slice(cfIdx).join('.')
    const middle = u.hostname.includes('trial') ? 'integrationsuite-trial' : 'integrationsuite'
    return `https://${tenant}.${middle}.${region}/shell/home`
  } catch {
    return null
  }
}

const SYSTEM_TYPE_COLOURS: Record<string, { bg: string; text: string; border: string }> = {
  TRL: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
  SBX: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
  DEV: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
  QA:  { bg: '#fef7e0', text: '#8f6000', border: '#f5c942' },
  PRD: { bg: '#ffeaea', text: '#bb0000', border: '#f5a5a5' },
}

function SystemTypeBadge({ type }: { type: string }) {
  const c = SYSTEM_TYPE_COLOURS[type] ?? SYSTEM_TYPE_COLOURS.DEV
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700,
      fontFamily: 'var(--sapFontFamily)',
      padding: '0.1rem 0.3rem', borderRadius: '3px',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      letterSpacing: '0.04em', marginLeft: '0.3rem',
    }}>
      {type}
    </span>
  )
}

export default function ContextBar() {
  const {
    projects, projectsLoading, projectsError,
    selectedProject,
    subProjects, selectedSubProject,
    instances, selectedInstance,
    selectProject, selectSubProject, selectInstance,
    refreshProjects,
  } = useWorkspace()

  const suiteURL = selectedInstance?.url ? buildSuiteURL(selectedInstance.url) : null

  const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>

      {/* Loading / error states */}
      {projectsLoading && (
        <span style={labelStyle}>Loading…</span>
      )}
      {!projectsLoading && projectsError && (
        <>
          <span style={{ ...labelStyle, color: 'var(--sapErrorColor)' }}>API unavailable</span>
          <Button design="Transparent" icon="refresh" onClick={refreshProjects} />
        </>
      )}

      {/* Project */}
      {!projectsLoading && !projectsError && projects.length === 0 ? (
        <span style={labelStyle}>No projects — create one in Design</span>
      ) : !projectsLoading && !projectsError && (
        <Select
          style={{ minWidth: '12rem' }}
          onChange={(e) => selectProject((e.detail as { selectedOption: { value: string } }).selectedOption.value)}
        >
          {projects.map(p => (
            <Option key={p.id} value={p.id} selected={selectedProject?.id === p.id}>
              {p.name}
            </Option>
          ))}
        </Select>
      )}

      {/* Sub-project */}
      {selectedProject && (
        <>
          <span style={{ color: 'var(--sapList_BorderColor)', fontSize: '0.8rem' }}>/</span>
          <Select
            style={{ minWidth: '10rem' }}
            disabled={subProjects.length === 0}
            onChange={(e) => selectSubProject((e.detail as { selectedOption: { value: string } }).selectedOption.value)}
          >
            {subProjects.length === 0 ? (
              <Option value="">No sub-projects</Option>
            ) : (
              subProjects.map(sp => (
                <Option key={sp.id} value={sp.id} selected={selectedSubProject?.id === sp.id}>
                  {sp.name}
                </Option>
              ))
            )}
          </Select>
        </>
      )}

      {/* Instance */}
      {selectedProject && (
        <>
          <span style={{ color: 'var(--sapList_BorderColor)', fontSize: '0.8rem' }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Select
              style={{ minWidth: '9rem' }}
              disabled={instances.length === 0}
              onChange={(e) => selectInstance((e.detail as { selectedOption: { value: string } }).selectedOption.value)}
            >
              {instances.length === 0 ? (
                <Option value="">No instances</Option>
              ) : (
                instances.map(inst => (
                  <Option key={inst.id} value={inst.id} selected={selectedInstance?.id === inst.id}>
                    {inst.name}
                  </Option>
                ))
              )}
            </Select>
            {selectedInstance && <SystemTypeBadge type={selectedInstance.system_type} />}
          </div>
        </>
      )}

      {/* Integration Suite shortcut */}
      {suiteURL && (
        <>
          <div style={{ width: '1px', height: '1.25rem', background: 'var(--sapList_BorderColor)', margin: '0 0.125rem' }} />
          <a
            href={suiteURL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              fontSize: '0.8rem', color: 'var(--sapLinkColor)',
              fontFamily: 'var(--sapFontFamily)', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            Integration Suite ↗
          </a>
        </>
      )}

    </div>
  )
}
