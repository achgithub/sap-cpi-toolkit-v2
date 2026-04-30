import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { Button, MessageStrip, BusyIndicator, Title, Input } from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'

interface TemplateVariant {
  id: string
  fragment_key: string
  variant_name: string
  content: string
  updated_at: string
}

interface FragmentGroup {
  fragment_key: string
  description: string
  variants: TemplateVariant[]
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function GlobalAdapterTemplates() {
  const [groups,    setGroups]    = useState<FragmentGroup[]>([])
  const [selected,  setSelected]  = useState<TemplateVariant | null>(null)
  const [draft,     setDraft]     = useState('')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [resetting, setResetting] = useState(false)
  const [dirty,     setDirty]     = useState(false)
  const [error,     setError]     = useState('')
  const [saved,     setSaved]     = useState(false)
  const [newFragmentOpen, setNewFragmentOpen] = useState(false)
  const [newFragmentKey,  setNewFragmentKey]  = useState('')
  const [creating,        setCreating]        = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/v2/scaffold/templates')
      if (!res.ok) throw new Error(await res.text())
      setGroups(await res.json() as FragmentGroup[])
    } catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function select(group: FragmentGroup) {
    const v = group.variants[0]
    if (!v) return
    setSelected(v); setDraft(v.content); setDirty(false); setSaved(false); setError('')
  }

  async function save() {
    if (!selected) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/variants/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated: TemplateVariant = await res.json()
      setSaved(true); setDirty(false)
      setSelected(updated)
      setGroups(gs => gs.map(g => g.fragment_key !== updated.fragment_key ? g : {
        ...g, variants: g.variants.map(v => v.id === updated.id ? updated : v),
      }))
    } catch (e: unknown) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function reset() {
    if (!selected) return
    setResetting(true); setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/variants/${selected.id}/reset`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const r2 = await fetch(`/api/v2/scaffold/templates/variants/${selected.id}`)
      if (r2.ok) {
        const updated: TemplateVariant = await r2.json()
        setSelected(updated); setDraft(updated.content); setDirty(false); setSaved(false)
        setGroups(gs => gs.map(g => g.fragment_key !== updated.fragment_key ? g : {
          ...g, variants: g.variants.map(v => v.id === updated.id ? updated : v),
        }))
      }
    } catch (e: unknown) { setError(String(e)) }
    finally { setResetting(false) }
  }

  async function deleteFragment(v: TemplateVariant) {
    setError('')
    try {
      // Mark it non-default first if needed, then delete
      const res = await fetch(`/api/v2/scaffold/templates/variants/${v.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? res.statusText)
      }
      if (selected?.id === v.id) setSelected(null)
      await load()
    } catch (e: unknown) { setError(String(e)) }
  }

  async function addFragment() {
    const key = newFragmentKey.trim()
    if (!key) return
    setCreating(true); setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/${encodeURIComponent(key)}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_name: 'Default', content: '<!-- new fragment -->' }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? res.statusText) }
      const created: TemplateVariant = await res.json()
      setNewFragmentOpen(false); setNewFragmentKey('')
      await load()
      setSelected(created); setDraft(created.content); setDirty(false); setSaved(false)
    } catch (e: unknown) { setError(String(e)) }
    finally { setCreating(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left panel ── */}
      <div style={{
        width: '280px', flexShrink: 0, borderRight: '1px solid var(--sapList_BorderColor)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
          <Title level="H5" style={{ margin: 0 }}>Global Templates</Title>
          <div style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', marginTop: '0.2rem' }}>
            Master library — changes do not affect existing projects
          </div>
        </div>

        {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><BusyIndicator active /></div>}

        {!loading && (
          <>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {groups.map(group => {
                const v = group.variants[0]
                return (
                  <div
                    key={group.fragment_key}
                    onClick={() => select(group)}
                    style={{
                      padding: '0.55rem 1rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--sapList_BorderColor)',
                      background: selected?.id === v?.id ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
                    }}
                  >
                    <div style={{ fontFamily: 'var(--sapFontMonospaceFamily, monospace)', fontSize: '0.75rem', fontWeight: 700 }}>
                      {group.fragment_key}
                    </div>
                    {group.description && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', marginTop: '0.1rem' }}>
                        {group.description}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* New fragment */}
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--sapList_BorderColor)', padding: '0.5rem' }}>
              {!newFragmentOpen ? (
                <Button design="Transparent" icon="add" style={{ width: '100%', fontSize: '0.78rem' }}
                  onClick={() => { setNewFragmentOpen(true); setNewFragmentKey('') }}>
                  New Fragment
                </Button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <Input
                    value={newFragmentKey}
                    placeholder="e.g. sender_messageflow_RFC"
                    style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
                    onInput={e => setNewFragmentKey((e.target as unknown as InputDomRef).value ?? '')}
                  />
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <Button design="Emphasized" style={{ flex: 1 }} disabled={creating || !newFragmentKey.trim()} onClick={addFragment}>
                      {creating ? '…' : 'Add'}
                    </Button>
                    <Button design="Transparent" onClick={() => setNewFragmentOpen(false)}>✕</Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected && !loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
            Select a fragment to edit
          </div>
        )}

        {selected && (
          <>
            <div style={{
              padding: '0.5rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)',
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--sapFontMonospaceFamily, monospace)', fontSize: '0.85rem', fontWeight: 600 }}>
                  {selected.fragment_key}
                </span>
                <span style={{ marginLeft: '0.75rem', fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)' }}>
                  updated {relTime(selected.updated_at)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <Button design="Negative" onClick={() => deleteFragment(selected)}>Delete</Button>
                <Button design="Transparent" onClick={reset} disabled={resetting || saving}>
                  {resetting ? 'Resetting…' : 'Reset to Default'}
                </Button>
                <Button design="Emphasized" onClick={save} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>

            {error && <div style={{ padding: '0.5rem 1rem' }}><MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip></div>}
            {saved && !dirty && <div style={{ padding: '0.5rem 1rem' }}><MessageStrip design="Positive" hideCloseButton>Saved.</MessageStrip></div>}
            {dirty && <div style={{ padding: '0.5rem 1rem' }}><MessageStrip design="Information" hideCloseButton>Unsaved changes</MessageStrip></div>}

            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Editor
                language="xml" value={draft} theme="vs"
                options={{ minimap: { enabled: false }, fontSize: 12, wordWrap: 'on', scrollBeyondLastLine: false }}
                onChange={val => { setDraft(val ?? ''); setDirty((val ?? '') !== selected.content); setSaved(false) }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
