import { useState, useCallback } from 'react'
import type { Component, InterfaceV2, ReceiverV2, StatusConfig } from './types_v2'
import { DEFAULT_STATUSES } from './types_v2'
import type { System, LogicalGroup, SystemTypeConfig, InfraTypeConfig } from './types'

const BASE    = '/api/interfaces'
const BASE_V2 = '/api/interfaces/v2'

async function checkOk(res: Response): Promise<void> {
  if (!res.ok) {
    const d = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(d.error ?? `Request failed (${res.status})`)
  }
}

export interface ComponentTypeConfig { name: string; color: string }

export interface RegistryConfigV2 {
  systemTypes:    SystemTypeConfig[]
  infraTypes:     InfraTypeConfig[]
  componentTypes: ComponentTypeConfig[]
  statuses:       StatusConfig[]
}

const DEFAULT_CONFIG_V2: RegistryConfigV2 = {
  systemTypes:    [{ name: 'Custom', color: 'var(--sapNeutralColor)' }],
  infraTypes:     [{ name: 'On-Prem', category: 'on_prem' }],
  componentTypes: [{ name: 'SAP Integration Suite', color: 'var(--sapHighlightColor)' }],
  statuses:       DEFAULT_STATUSES,
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
      const [sRes, gRes, cRes, iRes, stRes, itRes, ctRes, statRes] = await Promise.all([
        fetch(`${BASE}/systems`),
        fetch(`${BASE}/logical-groups`),
        fetch(`${BASE_V2}/components${arch}`),
        fetch(`${BASE_V2}/interfaces${arch}`),
        fetch(`${BASE}/config/system_types`),
        fetch(`${BASE}/config/infra_types`),
        fetch(`${BASE}/config/component_types`),
        fetch(`${BASE}/config/statuses`),
      ])
      const [s, g, c, i, st, it, ct, stat] = await Promise.all([
        sRes.json(), gRes.json(), cRes.json(), iRes.json(),
        stRes.json(), itRes.json(), ctRes.json(), statRes.json(),
      ])
      setSystems(s as System[])
      setLogicalGroups(g as LogicalGroup[])
      setComponents(c as Component[])
      setInterfaces(i as InterfaceV2[])
      setConfig({ systemTypes: st, infraTypes: it, componentTypes: ct, statuses: Array.isArray(stat) ? stat : DEFAULT_STATUSES })
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

  return {
    systems, logicalGroups, components, interfaces, config, loading, error,
    load,
    createComponent, updateComponent, archiveComponent,
    createInterface, updateInterface, archiveInterface, unarchiveInterface,
    addReceiver, updateReceiver, deleteReceiver,
  }
}
