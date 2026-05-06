import { useState } from 'react'
import { emptyFilter, type DiagramFilter } from '../registry/useRegistryApi'
import {
  Button, Dialog, Bar, Input, Label, MessageStrip,
  FlexBox, FlexBoxJustifyContent,
} from '@ui5/webcomponents-react'
import PhaseLayout from '../../components/PhaseLayout'
import { useWorkspace, type Project } from '../../context/WorkspaceContext'
import ProjectSetup from './ProjectSetup'
import ProjectAdapterTemplates from '../../tools/ProjectAdapterTemplates'
import ArchitectureView from '../registry/ArchitectureView'
import RegistryGrid from '../registry/RegistryGrid'
import SystemView from '../registry/SystemView'

interface ProjectForm { name: string; description: string }
const emptyForm = (): ProjectForm => ({ name: '', description: '' })

function ProjectsSection() {
  const { projects, selectedProject, selectProject, refreshProjects } = useWorkspace()

  const [createOpen,   setCreateOpen]   = useState(false)
  const [editProject,  setEditProject]  = useState<(ProjectForm & { id: string }) | null>(null)
  const [deleteId,     setDeleteId]     = useState<string | null>(null)
  const [form,         setForm]         = useState<ProjectForm>(emptyForm)
  const [error,        setError]        = useState('')
  const [saving,       setSaving]       = useState(false)

  function openCreate() {
    setForm(emptyForm())
    setError('')
    setCreateOpen(true)
  }

  function openEdit(p: Project) {
    setEditProject({ id: p.id, name: p.name, description: p.description })
    setForm({ name: p.name, description: p.description })
    setError('')
  }

  function closeForm() {
    setCreateOpen(false)
    setEditProject(null)
    setError('')
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        editProject ? `/api/v2/projects/${editProject.id}` : '/api/v2/projects',
        {
          method: editProject ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.trim(), description: form.description }),
        },
      )
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? res.statusText)
      }
      const saved = await res.json() as Project
      await refreshProjects()
      selectProject(saved.id)
      closeForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    await fetch(`/api/v2/projects/${deleteId}`, { method: 'DELETE' })
    await refreshProjects()
    setDeleteId(null)
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Projects ── */}
      <SectionCard
        title="Projects"
        action={<Button design="Transparent" icon="add" onClick={openCreate}>New Project</Button>}
      >
        {projects.length === 0
          ? <EmptyState>No projects yet — click New Project to get started.</EmptyState>
          : projects.map(p => (
            <ItemRow
              key={p.id}
              selected={selectedProject?.id === p.id}
              onClick={() => selectProject(p.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={titleStyle}>{p.name}</span>
                {p.description && <span style={subStyle}> — {p.description}</span>}
              </div>
              <Button design="Transparent" onClick={(e) => { e.stopPropagation(); openEdit(p) }}>Edit</Button>
              <Button design="Transparent" onClick={(e) => { e.stopPropagation(); setDeleteId(p.id) }}>Delete</Button>
            </ItemRow>
          ))
        }
      </SectionCard>

      {/* ── Project detail (sub-projects, instances, members) ── */}
      {selectedProject && <ProjectSetup key={selectedProject.id} project={selectedProject} />}

      {/* ── Create / Edit dialog ── */}
      <Dialog
        open={createOpen || !!editProject}
        headerText={editProject ? 'Edit Project' : 'New Project'}
        onClose={closeForm}
        style={{ width: '480px', maxWidth: '95vw' }}
      >
        <div style={formBody}>
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
          <FormField label="Name" required>
            <Input
              value={form.name}
              onInput={e => setForm(f => ({ ...f, name: (e.target as unknown as HTMLInputElement).value }))}
              style={{ width: '100%' }}
            />
          </FormField>
          <FormField label="Description">
            <Input
              value={form.description}
              onInput={e => setForm(f => ({ ...f, description: (e.target as unknown as HTMLInputElement).value }))}
              style={{ width: '100%' }}
            />
          </FormField>
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={closeForm}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </FlexBox>
        </Bar>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog
        open={!!deleteId}
        headerText="Delete Project"
        onClose={() => setDeleteId(null)}
        style={{ width: '420px', maxWidth: '95vw' }}
      >
        <div style={formBody}>
          <p style={{ margin: 0, fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapTextColor)' }}>
            This will permanently delete the project and all its sub-projects, instances, and members. This cannot be undone.
          </p>
        </div>
        <Bar slot="footer">
          <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} style={{ width: '100%', padding: '0 0.5rem' }}>
            <Button onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button design="Negative" onClick={confirmDelete}>Delete</Button>
          </FlexBox>
        </Bar>
      </Dialog>

    </div>
  )
}

// ── Design phase shell with sub-nav ──────────────────────────────────────────

const DESIGN_NAV = [
  { id: 'projects',      label: 'Projects',      icon: 'business-objects-experience' },
  { id: 'templates',     label: 'Templates',     icon: 'wrench'                      },
  { id: 'architecture',  label: 'Architecture',  icon: 'org-chart'                   },
  { id: 'flow',          label: 'Flow Diagram',  icon: 'process'                     },
  { id: 'registry',      label: 'Registry',      icon: 'detail-view'                 },
  { id: 'systems',       label: 'Systems',       icon: 'it-system'                   },
]

function PhasePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 2rem', gap: '0.75rem' }}>
      <span style={{ fontFamily: 'var(--sapFontHeaderFamily)', fontSize: 'var(--sapFontHeader3Size)', color: 'var(--sapTextColor)' }}>{title}</span>
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center', maxWidth: '480px' }}>{description}</span>
    </div>
  )
}

function TemplatesSection() {
  const { selectedProject } = useWorkspace()
  if (!selectedProject) {
    return (
      <PhasePlaceholder
        title="No project selected"
        description="Select a project from the Projects tab to view and edit its adapter templates."
      />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '0.5rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapGroup_TitleBackground)', flexShrink: 0,
        fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)',
      }}>
        Showing templates for project: <strong style={{ color: 'var(--sapTextColor)' }}>{selectedProject.name}</strong>
        &nbsp;— changes here only affect this project. Edit the global library via Toolbox → Adapter Templates.
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ProjectAdapterTemplates projectId={selectedProject.id} projectName={selectedProject.name} />
      </div>
    </div>
  )
}

export default function DesignPhase() {
  const [archFilter,     setArchFilter]     = useState<DiagramFilter>(emptyFilter())
  const [registryFilter, setRegistryFilter] = useState<{ sender?: string; receiver?: string }>({})
  const [fromArch,       setFromArch]       = useState(false)

  return (
    <PhaseLayout storageKey="v2-design" items={DESIGN_NAV}>
      {(id, setId) => (
        <>
          {id === 'projects'     && <ProjectsSection />}
          {id === 'templates'    && <TemplatesSection />}
          {id === 'architecture' && (
            <ArchitectureView
              filter={archFilter}
              onFilterChange={setArchFilter}
              onOpenRegistry={(sender, receiver) => {
                setRegistryFilter({ sender, receiver })
                setFromArch(true)
                setId('registry')
              }}
            />
          )}
          {id === 'flow' && (
            <PhasePlaceholder
              title="Flow Diagram"
              description="Per logical group or standalone interface — shows the delivery/support flow with sender, middleware, receiver, firewalls, and numbered steps. Coming next."
            />
          )}
          {id === 'registry' && (
            <RegistryGrid
              key={`${registryFilter.sender ?? ''}-${registryFilter.receiver ?? ''}`}
              initialSenderSystemId={registryFilter.sender}
              initialReceiverSystemId={registryFilter.receiver}
              onBack={fromArch ? () => { setFromArch(false); setId('architecture') } : undefined}
            />
          )}
          {id === 'systems' && <SystemView />}
        </>
      )}
    </PhaseLayout>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

export function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.625rem 1rem',
        background: 'var(--sapGroup_TitleBackground)',
        borderBottom: '1px solid var(--sapList_BorderColor)',
      }}>
        <span style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }}>
          {title}
        </span>
        {action}
      </div>
      <div style={{ background: 'var(--sapGroup_ContentBackground)' }}>
        {children}
      </div>
    </div>
  )
}

export function ItemRow({ selected, onClick, children }: { selected?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 1rem',
        borderBottom: '1px solid var(--sapList_BorderColor)',
        background: selected ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '1.5rem', textAlign: 'center', fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
      {children}
    </div>
  )
}

export function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <Label required={required}>{label}</Label>
      {children}
    </div>
  )
}

export const formBody: React.CSSProperties = { padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }
export const titleStyle: React.CSSProperties = { fontFamily: 'var(--sapFontFamily)', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--sapTextColor)' }
export const subStyle: React.CSSProperties   = { fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }
