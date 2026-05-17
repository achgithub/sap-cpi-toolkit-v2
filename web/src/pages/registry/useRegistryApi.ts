import { useState, useCallback } from 'react'
import type {
  System, LogicalGroup, Interface, Receiver, Dependency,
  DiagramEdge, RegistryConfig,
} from './types'

const BASE = '/api/interfaces'

async function checkOk(res: Response): Promise<void> {
  if (!res.ok) {
    const d = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(d.error ?? `Request failed (${res.status})`)
  }
}

const DEFAULT_CONFIG: RegistryConfig = {
  systemTypes: [{ name: 'Custom', color: '#78909C' }],
  infraTypes:  [{ name: 'On-Prem', category: 'on_prem' }],
  platforms:   [{ name: 'SAP Integration Suite', color: '#E65100' }],
}

export interface DiagramFilter {
  systemIds:        string[]
  infraTypes:       string[]
  statuses:         string[]
  functionalDomain: string[]
  deliveryProjectId: string
  strict:           boolean
}

export const emptyFilter = (): DiagramFilter => ({
  systemIds: [], infraTypes: [], statuses: [],
  functionalDomain: [], deliveryProjectId: '', strict: true,
})

export function useRegistryApi() {
  const [systems,       setSystems]       = useState<System[]>([])
  const [logicalGroups, setLogicalGroups] = useState<LogicalGroup[]>([])
  const [interfaces,    setInterfaces]    = useState<Interface[]>([])
  const [config,        setConfig]        = useState<RegistryConfig>(DEFAULT_CONFIG)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')

  // ── Bootstrap ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [sRes, gRes, iRes, stRes, itRes, ipRes] = await Promise.all([
        fetch(`${BASE}/systems`),
        fetch(`${BASE}/logical-groups`),
        fetch(`${BASE}/interfaces`),
        fetch(`${BASE}/config/system_types`),
        fetch(`${BASE}/config/infra_types`),
        fetch(`${BASE}/config/integration_platforms`),
      ])
      const [s, g, i, st, it, ip] = await Promise.all([
        sRes.json(), gRes.json(), iRes.json(), stRes.json(), itRes.json(), ipRes.json(),
      ])
      setSystems(s as System[])
      setLogicalGroups(g as LogicalGroup[])
      setInterfaces(i as Interface[])
      setConfig(c => ({ ...c, systemTypes: st, infraTypes: it, platforms: (ip as {name:string;color?:string}[]).map(p => ({ ...p, color: p.color ?? '#E65100' })) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Diagram ───────────────────────────────────────────────────────────────────

  const loadDiagram = useCallback(async (filter: DiagramFilter) => {
    const p = new URLSearchParams()
    if (filter.systemIds.length)        p.set('system_ids',          filter.systemIds.join(','))
    if (filter.infraTypes.length)       p.set('infra_types',         filter.infraTypes.join(','))
    if (filter.statuses.length)         p.set('statuses',            filter.statuses.join(','))
    if (filter.functionalDomain.length) p.set('functional_domain',   filter.functionalDomain.join(','))
    if (filter.deliveryProjectId)       p.set('delivery_project_id', filter.deliveryProjectId)
    if (!filter.strict)                 p.set('strict', '0')

    const res = await fetch(`${BASE}/diagram?${p}`)
    if (!res.ok) throw new Error('Failed to load diagram')
    return res.json() as Promise<{ systems: System[]; edges: DiagramEdge[] }>
  }, [])

  // ── Systems ───────────────────────────────────────────────────────────────────

  const createSystem = useCallback(async (body: Partial<System>) => {
    const res = await fetch(`${BASE}/systems`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const s = await res.json() as System
    setSystems(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
    return s
  }, [])

  const updateSystem = useCallback(async (id: string, body: Partial<System>) => {
    const res = await fetch(`${BASE}/systems/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const s = await res.json() as System
    setSystems(prev => prev.map(x => x.id === id ? s : x))
    return s
  }, [])

  const updateSystemPos = useCallback(async (id: string, x: number, y: number) => {
    const sys = systems.find(s => s.id === id)
    if (!sys) return
    await fetch(`${BASE}/systems/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sys, pos_x: x, pos_y: y }),
    })
    setSystems(prev => prev.map(s => s.id === id ? { ...s, pos_x: x, pos_y: y } : s))
  }, [systems])

  const deleteSystem = useCallback(async (id: string) => {
    await fetch(`${BASE}/systems/${id}`, { method: 'DELETE' })
    setSystems(prev => prev.filter(s => s.id !== id))
  }, [])

  // ── Logical groups ─────────────────────────────────────────────────────────────

  const createLogicalGroup = useCallback(async (body: { name: string; description: string }) => {
    const res = await fetch(`${BASE}/logical-groups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const g = await res.json() as LogicalGroup
    setLogicalGroups(prev => [...prev, g].sort((a, b) => a.name.localeCompare(b.name)))
    return g
  }, [])

  const updateLogicalGroup = useCallback(async (id: string, body: { name: string; description: string }) => {
    const res = await fetch(`${BASE}/logical-groups/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const g = await res.json() as LogicalGroup
    setLogicalGroups(prev => prev.map(x => x.id === id ? g : x))
    return g
  }, [])

  const deleteLogicalGroup = useCallback(async (id: string) => {
    await fetch(`${BASE}/logical-groups/${id}`, { method: 'DELETE' })
    setLogicalGroups(prev => prev.filter(g => g.id !== id))
  }, [])

  // ── Interfaces ────────────────────────────────────────────────────────────────

  const createInterface = useCallback(async (body: Partial<Interface>) => {
    const res = await fetch(`${BASE}/interfaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const i = await res.json() as Interface
    setInterfaces(prev => [...prev, i].sort((a, b) => a.name.localeCompare(b.name)))
    return i
  }, [])

  const updateInterface = useCallback(async (id: string, body: Partial<Interface>) => {
    const res = await fetch(`${BASE}/interfaces/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const i = await res.json() as Interface
    setInterfaces(prev => prev.map(x => x.id === id ? i : x))
    return i
  }, [])

  const deleteInterface = useCallback(async (id: string) => {
    await fetch(`${BASE}/interfaces/${id}`, { method: 'DELETE' })
    setInterfaces(prev => prev.filter(i => i.id !== id))
  }, [])

  // ── Receivers ─────────────────────────────────────────────────────────────────

  const addReceiver = useCallback(async (ifaceId: string, body: Partial<Receiver>) => {
    const res = await fetch(`${BASE}/interfaces/${ifaceId}/receivers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const rec = await res.json() as Receiver
    setInterfaces(prev => prev.map(i =>
      i.id === ifaceId ? { ...i, receivers: [...i.receivers, rec] } : i
    ))
    return rec
  }, [])

  const updateReceiver = useCallback(async (ifaceId: string, rid: string, body: Partial<Receiver>) => {
    const res = await fetch(`${BASE}/interfaces/${ifaceId}/receivers/${rid}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const rec = await res.json() as Receiver
    setInterfaces(prev => prev.map(i =>
      i.id === ifaceId
        ? { ...i, receivers: i.receivers.map(r => r.id === rid ? rec : r) }
        : i
    ))
    return rec
  }, [])

  const deleteReceiver = useCallback(async (ifaceId: string, rid: string) => {
    await fetch(`${BASE}/interfaces/${ifaceId}/receivers/${rid}`, { method: 'DELETE' })
    setInterfaces(prev => prev.map(i =>
      i.id === ifaceId
        ? { ...i, receivers: i.receivers.filter(r => r.id !== rid) }
        : i
    ))
  }, [])

  // ── Dependencies ──────────────────────────────────────────────────────────────

  const listDependencies = useCallback(async (ifaceId: string) => {
    const res = await fetch(`${BASE}/interfaces/${ifaceId}/dependencies`)
    return res.json() as Promise<Dependency[]>
  }, [])

  const addDependency = useCallback(async (
    ifaceId: string,
    body: { depends_on_id: string; kind: string; note: string }
  ) => {
    const res = await fetch(`${BASE}/interfaces/${ifaceId}/dependencies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json() as Promise<Dependency>
  }, [])

  const deleteDependency = useCallback(async (ifaceId: string, did: string) => {
    await fetch(`${BASE}/interfaces/${ifaceId}/dependencies/${did}`, { method: 'DELETE' })
  }, [])

  // ── Config ────────────────────────────────────────────────────────────────────

  const saveConfig = useCallback(async (key: string, value: unknown) => {
    await fetch(`${BASE}/config/${key}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    })
  }, [])

  return {
    systems, logicalGroups, interfaces, config, loading, error,
    load, loadDiagram, saveConfig,
    createSystem, updateSystem, updateSystemPos, deleteSystem,
    createLogicalGroup, updateLogicalGroup, deleteLogicalGroup,
    createInterface, updateInterface, deleteInterface,
    addReceiver, updateReceiver, deleteReceiver,
    listDependencies, addDependency, deleteDependency,
  }
}
