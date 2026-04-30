import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { Button, MessageStrip, BusyIndicator, Title, FlexBox, Input } from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import { useWorkspace } from '../context/WorkspaceContext'

interface TemplateVariant {
  id: string
  fragment_key: string
  project_id: string | null
  variant_name: string
  description: string
  content: string
  is_default: boolean
  updated_at: string
}

interface FragmentGroup {
  fragment_key: string
  description: string
  variants: TemplateVariant[]
}

type Mode = 'global' | 'project'

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function AdapterTemplates({ projectId }: { projectId?: string }) {
  const { selectedProject } = useWorkspace()
  const effectiveProjectId = projectId ?? selectedProject?.id
  const mode: Mode = effectiveProjectId ? 'project' : 'global'

  const [groups,    setGroups]    = useState<FragmentGroup[]>([])
  const [selected,  setSelected]  = useState<{ group: FragmentGroup; variant: TemplateVariant } | null>(null)
  const [draft,     setDraft]     = useState('')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [resetting, setResetting] = useState(false)
  const [dirty,     setDirty]     = useState(false)
  const [error,     setError]     = useState('')
  const [saved,     setSaved]     = useState(false)
  const [newVariantKey,  setNewVariantKey]  = useState<string | null>(null)
  const [newVariantName, setNewVariantName] = useState('')
  const [creating, setCreating] = useState(false)

  const baseUrl = mode === 'project' && effectiveProjectId
    ? `/api/v2/projects/${effectiveProjectId}/scaffold/templates`
    : '/api/v2/scaffold/templates'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(baseUrl)
      if (!res.ok) throw new Error(await res.text())
      setGroups(await res.json() as FragmentGroup[])
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => { load() }, [load])

  function selectVariant(group: FragmentGroup, variant: TemplateVariant) {
    setSelected({ group, variant })
    setDraft(variant.content)
    setDirty(false)
    setSaved(false)
    setError('')
    setNewVariantKey(null)
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/variants/${selected.variant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft, description: selected.variant.description }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated: TemplateVariant = await res.json()
      setSaved(true)
      setDirty(false)
      setGroups(gs => gs.map(g => g.fragment_key !== selected.group.fragment_key ? g : {
        ...g,
        variants: g.variants.map(v => v.id === updated.id ? updated : v),
      }))
      setSelected(s => s ? { ...s, variant: updated } : s)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function setDefault(variantId: string) {
    setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/variants/${variantId}/default`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      await load()
      // Re-select the same variant
      setSelected(s => {
        if (!s) return s
        return { ...s, variant: { ...s.variant, is_default: true } }
      })
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  async function reset() {
    if (!selected) return
    setResetting(true)
    setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/variants/${selected.variant.id}/reset`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      // Reload and re-fetch the updated variant
      const r2 = await fetch(`/api/v2/scaffold/templates/variants/${selected.variant.id}`)
      if (r2.ok) {
        const updated: TemplateVariant = await r2.json()
        setDraft(updated.content)
        setDirty(false)
        setSaved(false)
        setSelected(s => s ? { ...s, variant: updated } : s)
        setGroups(gs => gs.map(g => g.fragment_key !== selected.group.fragment_key ? g : {
          ...g,
          variants: g.variants.map(v => v.id === updated.id ? updated : v),
        }))
      }
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setResetting(false)
    }
  }

  async function deleteVariant(variantId: string) {
    setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/variants/${variantId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? res.statusText)
      }
      if (selected?.variant.id === variantId) setSelected(null)
      await load()
    } catch (e: unknown) {
      setError(String(e))
    }
  }

  async function createVariant() {
    if (!newVariantKey || !newVariantName.trim()) return
    setCreating(true)
    setError('')
    try {
      const url = mode === 'project' && effectiveProjectId
        ? `/api/v2/projects/${effectiveProjectId}/scaffold/templates/${encodeURIComponent(newVariantKey)}/variants`
        : `/api/v2/scaffold/templates/${encodeURIComponent(newVariantKey)}/variants`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_name: newVariantName.trim(), content: '<!-- new variant -->' }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? res.statusText)
      }
      const created: TemplateVariant = await res.json()
      setNewVariantKey(null)
      setNewVariantName('')
      await load()
      const group = groups.find(g => g.fragment_key === newVariantKey)
      if (group) selectVariant(group, created)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const scopeLabel = mode === 'project' && selectedProject ? selectedProject.name : 'Global'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left panel ── */}
      <div style={{
        width: '300px', flexShrink: 0, borderRight: '1px solid var(--sapList_BorderColor)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
          <Title level="H5" style={{ margin: 0 }}>Adapter Templates</Title>
          <div style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginTop: '0.2rem' }}>
            Scope: <strong>{scopeLabel}</strong>
          </div>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <BusyIndicator active />
          </div>
        )}

        {!loading && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            {groups.length === 0 && (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                No templates found.
                {mode === 'project' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <Button design="Transparent" onClick={async () => {
                      await fetch(baseUrl, { method: 'POST' })
                      load()
                    }}>Copy from Global</Button>
                  </div>
                )}
              </div>
            )}
            {groups.map(group => (
              <div key={group.fragment_key}>
                {/* Fragment heading */}
                <div style={{
                  padding: '0.4rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--sapGroup_TitleBackground)',
                  borderBottom: '1px solid var(--sapList_BorderColor)',
                  borderTop: '1px solid var(--sapList_BorderColor)',
                }}>
                  <span style={{ fontFamily: 'var(--sapFontMonospaceFamily, monospace)', fontSize: '0.7rem', fontWeight: 700 }}>
                    {group.fragment_key}
                  </span>
                  <Button
                    design="Transparent"
                    icon="add"
                    style={{ fontSize: '0.7rem', height: '1.4rem' }}
                    onClick={() => { setNewVariantKey(group.fragment_key); setNewVariantName('') }}
                  />
                </div>
                {/* Variants */}
                {group.variants.map(variant => (
                  <div
                    key={variant.id}
                    onClick={() => selectVariant(group, variant)}
                    style={{
                      padding: '0.5rem 1rem 0.5rem 1.5rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--sapList_BorderColor)',
                      background: selected?.variant.id === variant.id
                        ? 'var(--sapList_SelectionBackgroundColor)'
                        : 'transparent',
                      display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapTextColor)' }}>
                      {variant.variant_name}
                    </span>
                    {variant.is_default && (
                      <span style={{
                        fontSize: '0.6rem', background: 'var(--sapHighlightColor)', color: '#fff',
                        borderRadius: '3px', padding: '0.1rem 0.3rem', fontWeight: 700,
                      }}>DEFAULT</span>
                    )}
                  </div>
                ))}
                {/* New variant input */}
                {newVariantKey === group.fragment_key && (
                  <div style={{ padding: '0.5rem 1rem 0.5rem 1.5rem', borderBottom: '1px solid var(--sapList_BorderColor)', display: 'flex', gap: '0.4rem' }}>
                    <Input
                      value={newVariantName}
                      placeholder="Variant name"
                      style={{ flex: 1, fontSize: '0.8rem' }}
                      onInput={e => setNewVariantName((e.target as unknown as InputDomRef).value ?? '')}
                    />
                    <Button design="Emphasized" onClick={createVariant} disabled={creating || !newVariantName.trim()}>
                      {creating ? '…' : 'Add'}
                    </Button>
                    <Button design="Transparent" onClick={() => setNewVariantKey(null)}>✕</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: editor ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected && !loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
            Select a variant to edit
          </div>
        )}

        {selected && (
          <>
            {/* Toolbar */}
            <div style={{
              padding: '0.5rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)',
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--sapFontMonospaceFamily, monospace)', fontSize: '0.8rem', fontWeight: 600 }}>
                  {selected.group.fragment_key}
                </span>
                <span style={{ margin: '0 0.4rem', color: 'var(--sapContent_LabelColor)' }}>/</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selected.variant.variant_name}</span>
                {selected.variant.is_default && (
                  <span style={{
                    marginLeft: '0.5rem', fontSize: '0.65rem', background: 'var(--sapHighlightColor)', color: '#fff',
                    borderRadius: '3px', padding: '0.1rem 0.3rem', fontWeight: 700,
                  }}>DEFAULT</span>
                )}
                <span style={{ marginLeft: '0.75rem', fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)' }}>
                  updated {relTime(selected.variant.updated_at)}
                </span>
              </div>
              <FlexBox style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                {!selected.variant.is_default && (
                  <Button design="Transparent" onClick={() => setDefault(selected.variant.id)}>
                    Set as Default
                  </Button>
                )}
                {!selected.variant.is_default && (
                  <Button design="Transparent" onClick={() => deleteVariant(selected.variant.id)}>
                    Delete
                  </Button>
                )}
                <Button design="Transparent" onClick={reset} disabled={resetting || saving}>
                  {resetting ? 'Resetting…' : 'Reset to Default'}
                </Button>
                <Button design="Emphasized" onClick={save} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </FlexBox>
            </div>

            {error && (
              <div style={{ padding: '0.5rem 1rem' }}>
                <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>
              </div>
            )}
            {saved && !dirty && (
              <div style={{ padding: '0.5rem 1rem' }}>
                <MessageStrip design="Positive" hideCloseButton>Saved.</MessageStrip>
              </div>
            )}
            {dirty && (
              <div style={{ padding: '0.5rem 1rem' }}>
                <MessageStrip design="Information" hideCloseButton>Unsaved changes</MessageStrip>
              </div>
            )}

            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Editor
                language="xml"
                value={draft}
                theme="vs"
                options={{ minimap: { enabled: false }, fontSize: 12, wordWrap: 'on', scrollBeyondLastLine: false }}
                onChange={(val) => {
                  setDraft(val ?? '')
                  setDirty((val ?? '') !== selected.variant.content)
                  setSaved(false)
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
