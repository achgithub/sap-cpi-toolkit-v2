import { useState, useCallback } from 'react'
import type { IFSystem, IFInterface, RegistryConfig, SystemTypeConfig, InfraTypeConfig, PlatformConfig } from './types'

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

  return {
    systems, interfaces, config, loading, error,
    load, loadConfig, saveConfig,
    createSystem, updateSystem, deleteSystem, updateSystemPos,
    createInterface, updateInterface, deleteInterface,
    addReceiver, updateReceiver, deleteReceiver,
  }
}
