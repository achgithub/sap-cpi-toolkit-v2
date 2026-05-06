import { useState, useCallback } from 'react'
import type { IFSystem, IFInterface, RegistryConfig, SystemTypeConfig, InfraTypeConfig, PlatformConfig, InterfaceDependency, CanvasElement } from './types'
import type { DiagramFilter } from './DiagramFilters'

const BASE = '/api/interfaces'

const DEFAULT_CONFIG: RegistryConfig = {
  systemTypes: [{ name: 'Custom', color: '#78909C' }],
  infraTypes:  [{ name: 'On-Prem', category: 'on_prem' }],
  platforms:   [{ name: 'SAP CPI' }],
}

export function useRegistryData(projectId: string) {
  const [systems,    setSystems]    = useState<IFSystem[]>([])
  const [interfaces, setInterfaces] = useState<IFInterface[]>([])
  const [config,     setConfig]     = useState<RegistryConfig>(DEFAULT_CONFIG)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const loadDiagram = useCallback(async (filter: DiagramFilter): Promise<{ systems: IFSystem[], interfaces: IFInterface[] }> => {
    const params = new URLSearchParams()
    if (filter.systems.length)    params.set('systems',     filter.systems.join(','))
    if (filter.statuses.length)   params.set('statuses',    filter.statuses.join(','))
    if (filter.infraTypes.length) params.set('infra_types', filter.infraTypes.join(','))
    const res = await fetch(`${BASE}/projects/${projectId}/diagram?${params}`)
    if (!res.ok) throw new Error('Failed to load diagram')
    return res.json() as Promise<{ systems: IFSystem[], interfaces: IFInterface[] }>
  }, [projectId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [sRes, iRes] = await Promise.all([
        fetch(`${BASE}/projects/${projectId}/systems`),
        fetch(`${BASE}/projects/${projectId}/interfaces`),
      ])
      if (!sRes.ok || !iRes.ok) throw new Error('Failed to load registry data')
      const [s, i] = await Promise.all([sRes.json(), iRes.json()]) as [IFSystem[], IFInterface[]]
      setSystems(s)
      setInterfaces(i)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadConfig = useCallback(async () => {
    try {
      const [stRes, itRes, plRes] = await Promise.all([
        fetch(`${BASE}/config/system_types`),
        fetch(`${BASE}/config/infra_types`),
        fetch(`${BASE}/config/integration_platforms`),
      ])
      const [st, it, pl] = await Promise.all([stRes.json(), itRes.json(), plRes.json()]) as [
        SystemTypeConfig[], InfraTypeConfig[], PlatformConfig[]
      ]
      setConfig({ systemTypes: st, infraTypes: it, platforms: pl })
    } catch {
      // keep defaults
    }
  }, [])

  async function saveConfig(key: string, value: unknown): Promise<void> {
    const res = await fetch(`${BASE}/config/${key}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    })
    if (!res.ok) throw new Error('Failed to save config')
    await loadConfig()
  }

  // Systems
  async function createSystem(body: Partial<IFSystem>) {
    const res = await fetch(`${BASE}/projects/${projectId}/systems`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    await load()
  }

  async function updateSystem(id: string, body: Partial<IFSystem>) {
    const res = await fetch(`${BASE}/projects/${projectId}/systems/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    await load()
  }

  async function deleteSystem(id: string) {
    await fetch(`${BASE}/projects/${projectId}/systems/${id}`, { method: 'DELETE' })
    await load()
  }

  async function updateSystemPos(id: string, pos_x: number, pos_y: number) {
    const sys = systems.find(s => s.id === id)
    if (!sys) return
    await fetch(`${BASE}/projects/${projectId}/systems/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sys, pos_x, pos_y }),
    })
  }

  // Interfaces
  async function createInterface(body: Partial<IFInterface>): Promise<void> {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    await load()
  }

  async function updateInterface(id: string, body: Partial<IFInterface>) {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    await load()
  }

  async function deleteInterface(id: string) {
    await fetch(`${BASE}/projects/${projectId}/interfaces/${id}`, { method: 'DELETE' })
    await load()
  }

  // Receivers
  async function addReceiver(ifaceId: string, body: object) {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/receivers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    await load()
  }

  async function updateReceiver(ifaceId: string, rid: string, body: object) {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/receivers/${rid}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    await load()
  }

  async function deleteReceiver(ifaceId: string, rid: string) {
    await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/receivers/${rid}`, { method: 'DELETE' })
    await load()
  }

  // Dependencies
  async function listDependencies(ifaceId: string): Promise<InterfaceDependency[]> {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/dependencies`)
    if (!res.ok) throw new Error('Failed to load dependencies')
    return res.json() as Promise<InterfaceDependency[]>
  }

  async function addDependency(ifaceId: string, body: { depends_on_id: string; kind: string; note: string }): Promise<InterfaceDependency> {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/dependencies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    return res.json() as Promise<InterfaceDependency>
  }

  async function deleteDependency(ifaceId: string, did: string): Promise<void> {
    await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/dependencies/${did}`, { method: 'DELETE' })
  }

  // Canvas elements
  async function listCanvasElements(ifaceId: string): Promise<CanvasElement[]> {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/canvas`)
    if (!res.ok) throw new Error('Failed to load canvas elements')
    return res.json() as Promise<CanvasElement[]>
  }

  async function addCanvasElement(ifaceId: string, body: Partial<CanvasElement>): Promise<CanvasElement> {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/canvas`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    return res.json() as Promise<CanvasElement>
  }

  async function updateCanvasElement(ifaceId: string, eid: string, body: Partial<CanvasElement>): Promise<CanvasElement> {
    const res = await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/canvas/${eid}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json() as { error: string }).error)
    return res.json() as Promise<CanvasElement>
  }

  async function deleteCanvasElement(ifaceId: string, eid: string): Promise<void> {
    await fetch(`${BASE}/projects/${projectId}/interfaces/${ifaceId}/canvas/${eid}`, { method: 'DELETE' })
  }

  return {
    systems, interfaces, config, loading, error,
    load, loadConfig, loadDiagram, saveConfig,
    createSystem, updateSystem, deleteSystem, updateSystemPos,
    createInterface, updateInterface, deleteInterface,
    addReceiver, updateReceiver, deleteReceiver,
    listDependencies, addDependency, deleteDependency,
    listCanvasElements, addCanvasElement, updateCanvasElement, deleteCanvasElement,
  }
}
