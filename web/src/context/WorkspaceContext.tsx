import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface SubProject {
  id: string
  project_id: string
  name: string
  type: 'interface' | 'library'
  cpi_package_id?: string
  created_at: string
  updated_at: string
}

export interface Instance {
  id: string
  project_id: string
  name: string
  url: string
  token_url: string
  client_id: string
  system_type: 'DEV' | 'QA' | 'PRD' | 'SBX' | 'TRL'
  pi_url: string
  pi_token_url: string
  pi_client_id: string
  rate_monitoring?: number
  rate_operations?: number
  rate_read?: number
  created_at: string
  updated_at: string
}

export interface ClipboardEntry {
  id: string
  name: string
  content: string
  source: string
  timestamp: number
}

const CLIPBOARD_MAX = 20

// ── Context shape ─────────────────────────────────────────────────────────────

interface WorkspaceContextValue {
  projects: Project[]
  projectsLoading: boolean
  projectsError: string | null
  selectedProject: Project | null
  subProjects: SubProject[]
  selectedSubProject: SubProject | null
  instances: Instance[]
  selectedInstance: Instance | null
  selectProject: (id: string) => void
  selectSubProject: (id: string) => void
  selectInstance: (id: string) => void
  refreshProjects: () => void
  refreshSubProjects: () => void
  refreshInstances: () => void
  // clipboard
  clipboard: ClipboardEntry[]
  pushClipboard: (entry: Omit<ClipboardEntry, 'id' | 'timestamp'>) => void
  promoteClipboard: (id: string) => void
  clearClipboard: () => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

const SEL_PROJECT_KEY    = 'v2-sel-project'
const SEL_SUBPROJECT_KEY = 'v2-sel-subproject'
const SEL_INSTANCE_KEY   = 'v2-sel-instance'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v2${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [projects,           setProjects]           = useState<Project[]>([])
  const [projectsLoading,    setProjectsLoading]    = useState(true)
  const [projectsError,      setProjectsError]      = useState<string | null>(null)
  const [selectedProject,    setSelectedProject]    = useState<Project | null>(null)
  const [subProjects,        setSubProjects]         = useState<SubProject[]>([])
  const [selectedSubProject, setSelectedSubProject]  = useState<SubProject | null>(null)
  const [instances,          setInstances]           = useState<Instance[]>([])
  const [selectedInstance,   setSelectedInstance]    = useState<Instance | null>(null)
  const [clipboard,          setClipboard]           = useState<ClipboardEntry[]>([])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    setProjectsError(null)
    try {
      const data = await apiFetch<Project[]>('/projects')
      setProjects(data)
      const savedId = localStorage.getItem(SEL_PROJECT_KEY)
      const match = savedId ? data.find(p => p.id === savedId) ?? null : null
      setSelectedProject(match ?? data[0] ?? null)
    } catch (e) {
      setProjectsError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  const loadSubProjects = useCallback(async (projectId: string) => {
    try {
      const data = await apiFetch<SubProject[]>(`/projects/${projectId}/sub-projects`)
      setSubProjects(data)
      const savedId = localStorage.getItem(SEL_SUBPROJECT_KEY)
      const match = savedId ? data.find(sp => sp.id === savedId) ?? null : null
      setSelectedSubProject(match ?? null)
    } catch {
      setSubProjects([])
      setSelectedSubProject(null)
    }
  }, [])

  const loadInstances = useCallback(async (projectId: string) => {
    try {
      const data = await apiFetch<Instance[]>(`/projects/${projectId}/instances`)
      setInstances(data)
      const savedId = localStorage.getItem(SEL_INSTANCE_KEY)
      const match = savedId ? data.find(i => i.id === savedId) ?? null : null
      setSelectedInstance(match ?? data[0] ?? null)
    } catch {
      setInstances([])
      setSelectedInstance(null)
    }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  useEffect(() => {
    if (selectedProject) {
      loadSubProjects(selectedProject.id)
      loadInstances(selectedProject.id)
    } else {
      setSubProjects([])
      setSelectedSubProject(null)
      setInstances([])
      setSelectedInstance(null)
    }
  }, [selectedProject, loadSubProjects, loadInstances])

  const selectProject = useCallback((id: string) => {
    const p = projects.find(x => x.id === id) ?? null
    setSelectedProject(p)
    localStorage.setItem(SEL_PROJECT_KEY, id)
    localStorage.removeItem(SEL_SUBPROJECT_KEY)
    localStorage.removeItem(SEL_INSTANCE_KEY)
  }, [projects])

  const selectSubProject = useCallback((id: string) => {
    const sp = subProjects.find(x => x.id === id) ?? null
    setSelectedSubProject(sp)
    localStorage.setItem(SEL_SUBPROJECT_KEY, id)
  }, [subProjects])

  const selectInstance = useCallback((id: string) => {
    const inst = instances.find(x => x.id === id) ?? null
    setSelectedInstance(inst)
    localStorage.setItem(SEL_INSTANCE_KEY, id)
  }, [instances])

  const pushClipboard = useCallback((entry: Omit<ClipboardEntry, 'id' | 'timestamp'>) => {
    setClipboard(prev => [
      { ...entry, id: `cb-${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: Date.now() },
      ...prev,
    ].slice(0, CLIPBOARD_MAX))
  }, [])

  const promoteClipboard = useCallback((id: string) => {
    setClipboard(prev => {
      const entry = prev.find(e => e.id === id)
      if (!entry) return prev
      return [entry, ...prev.filter(e => e.id !== id)]
    })
  }, [])

  const clearClipboard = useCallback(() => setClipboard([]), [])

  return (
    <WorkspaceContext.Provider value={{
      projects, projectsLoading, projectsError,
      selectedProject,
      subProjects, selectedSubProject,
      instances, selectedInstance,
      selectProject, selectSubProject, selectInstance,
      refreshProjects:    loadProjects,
      refreshSubProjects: () => { if (selectedProject) loadSubProjects(selectedProject.id) },
      refreshInstances:   () => { if (selectedProject) loadInstances(selectedProject.id) },
      clipboard, pushClipboard, promoteClipboard, clearClipboard,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}

export function useClipboard() {
  const { clipboard, pushClipboard, promoteClipboard, clearClipboard } = useWorkspace()
  return { clipboard, pushClipboard, promoteClipboard, clearClipboard }
}

// ── Helpers exported for tools ────────────────────────────────────────────────

export function clipboardName(prefix: string): string {
  const d = new Date()
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${prefix} · ${hh}:${mm}`
}
