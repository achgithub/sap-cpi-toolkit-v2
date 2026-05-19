import { useState, useCallback } from 'react'
import type { Component, InterfaceV2, ReceiverV2, StatusConfig } from './types_v2'
import { DEFAULT_STATUSES } from './types_v2'
import type { System, LogicalGroup, SystemTypeConfig, InfraTypeConfig, DiagramEdge, DiagramFilter } from './types'

const BASE    = '/api/interfaces'
const BASE_V2 = '/api/interfaces/v2'

async function checkOk(res: Response): Promise<void> {
  if (!res.ok) {
    const d = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(d.error ?? `Request failed (${res.status})`)
  }
}

export interface ComponentTypeConfig { name: string; color: string }

export interface ManagedByConfig    { name: string; color: string }
export interface DeploymentTypeConfig { name: string }
export interface OwnerTypeConfig    { name: string }

export interface RegistryConfigV2 {
  systemTypes:     SystemTypeConfig[]
  infraTypes:      InfraTypeConfig[]
  componentTypes:  ComponentTypeConfig[]
  statuses:        StatusConfig[]
  managedByTypes:  ManagedByConfig[]
  deploymentTypes: DeploymentTypeConfig[]
  ownerTypes:      OwnerTypeConfig[]
}

const DEFAULT_CONFIG_V2: RegistryConfigV2 = {
  systemTypes:     [{ name: 'Custom', color: 'var(--sapNeutralColor)' }],
  infraTypes:      [{ name: 'On-Prem', category: 'on_prem' }],
  componentTypes:  [{ name: 'SAP Integration Suite', color: 'var(--sapHighlightColor)' }],
  statuses:        DEFAULT_STATUSES,
  managedByTypes:  [{ name: 'Customer', color: '#2E7D32' }],
  deploymentTypes: [{ name: 'On-Premises' }],
  ownerTypes:      [{ name: 'IT Shared Services' }],
}

export function useRegistryApiV2() {
  const [systems,       setSystems]       = useState<System[]>([])
  const [logicalGroups, setLogicalGroups] = useState<LogicalGroup[]>([])
  const [components,    setComponents]    = useState<Component[]>([])
  const [interfaces,    setInterfaces]    = useState<InterfaceV2[]>([])
  const [config,        setConfig]        = useState<RegistryConfigV2>(DEFAULT_CONFIG_V2)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')

  const load = useCallback(async (includeArchived = false) => {
    setLoading(true); setError('')
    const arch = includeArchived ? '?include_archived=true' : ''
    try {
      const [sRes, gRes, cRes, iRes, stRes, itRes, ctRes, statRes, mbRes, dtRes, otRes] = await Promise.all([
        fetch(`${BASE}/systems`),
        fetch(`${BASE}/logical-groups`),
        fetch(`${BASE_V2}/components${arch}`),
        fetch(`${BASE_V2}/interfaces${arch}`),
        fetch(`${BASE}/config/system_types`),
        fetch(`${BASE}/config/infra_types`),
        fetch(`${BASE}/config/component_types`),
        fetch(`${BASE}/config/statuses`),
        fetch(`${BASE}/config/managed_by_types`),
        fetch(`${BASE}/config/deployment_types`),
        fetch(`${BASE}/config/owner_types`),
      ])
      const [s, g, c, i, st, it, ct, stat, mb, dt, ot] = await Promise.all([
        sRes.json(), gRes.json(), cRes.json(), iRes.json(),
        stRes.json(), itRes.json(), ctRes.json(), statRes.json(),
        mbRes.ok ? mbRes.json() : DEFAULT_CONFIG_V2.managedByTypes,
        dtRes.ok ? dtRes.json() : DEFAULT_CONFIG_V2.deploymentTypes,
        otRes.ok ? otRes.json() : DEFAULT_CONFIG_V2.ownerTypes,
      ])
      setSystems(s as System[])
      setLogicalGroups(g as LogicalGroup[])
      setComponents(c as Component[])
      setInterfaces(i as InterfaceV2[])
      setConfig({
        systemTypes: st, infraTypes: it, componentTypes: ct,
        statuses: Array.isArray(stat) ? stat : DEFAULT_STATUSES,
        managedByTypes:  Array.isArray(mb) ? mb : DEFAULT_CONFIG_V2.managedByTypes,
        deploymentTypes: Array.isArray(dt) ? dt : DEFAULT_CONFIG_V2.deploymentTypes,
        ownerTypes:      Array.isArray(ot) ? ot : DEFAULT_CONFIG_V2.ownerTypes,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Components ────────────────────────────────────────────────────────────────

  const createComponent = useCallback(async (body: Partial<Component>) => {
    const res = await fetch(`${BASE_V2}/components`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const c = await res.json() as Component
    setComponents(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
    return c
  }, [])

  const updateComponent = useCallback(async (id: string, body: Partial<Component>) => {
    const res = await fetch(`${BASE_V2}/components/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const c = await res.json() as Component
    setComponents(prev => prev.map(x => x.id === id ? c : x))
    return c
  }, [])

  const archiveComponent = useCallback(async (id: string) => {
    const res = await fetch(`${BASE_V2}/components/${id}/archive`, { method: 'POST' })
    await checkOk(res)
    setComponents(prev => prev.filter(c => c.id !== id))
  }, [])

  // ── Interfaces ────────────────────────────────────────────────────────────────

  const createInterface = useCallback(async (body: Partial<InterfaceV2>) => {
    const res = await fetch(`${BASE_V2}/interfaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const i = await res.json() as InterfaceV2
    setInterfaces(prev => [...prev, i].sort((a, b) => a.name.localeCompare(b.name)))
    return i
  }, [])

  const updateInterface = useCallback(async (id: string, body: Partial<InterfaceV2>) => {
    const res = await fetch(`${BASE_V2}/interfaces/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const i = await res.json() as InterfaceV2
    setInterfaces(prev => prev.map(x => x.id === id ? i : x))
    return i
  }, [])

  const archiveInterface = useCallback(async (id: string) => {
    const res = await fetch(`${BASE_V2}/interfaces/${id}/archive`, { method: 'POST' })
    await checkOk(res)
    setInterfaces(prev => prev.filter(i => i.id !== id))
  }, [])

  const unarchiveInterface = useCallback(async (id: string) => {
    const res = await fetch(`${BASE_V2}/interfaces/${id}/unarchive`, { method: 'POST' })
    await checkOk(res)
    const updated = await res.json() as InterfaceV2
    setInterfaces(prev => [...prev, updated].sort((a, b) => a.name.localeCompare(b.name)))
    return updated
  }, [])

  // ── Receivers ─────────────────────────────────────────────────────────────────

  const addReceiver = useCallback(async (ifaceId: string, body: Partial<ReceiverV2>) => {
    const res = await fetch(`${BASE_V2}/interfaces/${ifaceId}/receivers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const rec = await res.json() as ReceiverV2
    setInterfaces(prev => prev.map(i =>
      i.id === ifaceId ? { ...i, receivers: [...i.receivers, rec] } : i
    ))
    return rec
  }, [])

  const updateReceiver = useCallback(async (ifaceId: string, rid: string, body: Partial<ReceiverV2>) => {
    const res = await fetch(`${BASE_V2}/interfaces/${ifaceId}/receivers/${rid}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await checkOk(res)
    const rec = await res.json() as ReceiverV2
    setInterfaces(prev => prev.map(i =>
      i.id === ifaceId
        ? { ...i, receivers: i.receivers.map(r => r.id === rid ? rec : r) }
        : i
    ))
    return rec
  }, [])

  const deleteReceiver = useCallback(async (ifaceId: string, rid: string) => {
    const res = await fetch(`${BASE_V2}/interfaces/${ifaceId}/receivers/${rid}`, { method: 'DELETE' })
    await checkOk(res)
    setInterfaces(prev => prev.map(i =>
      i.id === ifaceId
        ? { ...i, receivers: i.receivers.filter(r => r.id !== rid) }
        : i
    ))
  }, [])

  const archiveReceiver = useCallback(async (ifaceId: string, rid: string) => {
    const res = await fetch(`${BASE_V2}/interfaces/${ifaceId}/receivers/${rid}/archive`, { method: 'POST' })
    await checkOk(res)
    setInterfaces(prev => prev.map(i =>
      i.id === ifaceId
        ? { ...i, receivers: i.receivers.filter(r => r.id !== rid) }
        : i
    ))
  }, [])

  const loadDiagramV2 = useCallback(async (filter: DiagramFilter) => {
    const p = new URLSearchParams()
    if (filter.systemIds.length)        p.set('system_ids',        filter.systemIds.join(','))
    if (filter.infraTypes.length)       p.set('infra_types',       filter.infraTypes.join(','))
    if (filter.statuses.length)         p.set('statuses',          filter.statuses.join(','))
    if (filter.functionalDomain.length) p.set('functional_domain', filter.functionalDomain.join(','))
    if (!filter.strict)                 p.set('strict', '0')
    const res = await fetch(`${BASE_V2}/diagram?${p}`)
    if (!res.ok) throw new Error('Failed to load diagram')
    return res.json() as Promise<{ systems: System[]; edges: DiagramEdge[] }>
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

  return {
    systems, logicalGroups, components, interfaces, config, loading, error,
    load,
    createComponent, updateComponent, archiveComponent,
    createInterface, updateInterface, archiveInterface, unarchiveInterface,
    addReceiver, updateReceiver, deleteReceiver, archiveReceiver,
    loadDiagramV2, updateSystemPos,
  }
}
