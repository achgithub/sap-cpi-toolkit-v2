import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { Button, MessageStrip, BusyIndicator, Title, FlexBox } from '@ui5/webcomponents-react'

interface TemplateRow {
  key: string
  description: string
  content: string
  updated_at: string
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function AdapterTemplates() {
  const [templates, setTemplates]   = useState<TemplateRow[]>([])
  const [selected, setSelected]     = useState<TemplateRow | null>(null)
  const [draft, setDraft]           = useState('')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [resetting, setResetting]   = useState(false)
  const [dirty, setDirty]           = useState(false)
  const [error, setError]           = useState('')
  const [saved, setSaved]           = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/v2/scaffold/templates')
      if (!res.ok) throw new Error(await res.text())
      const data: TemplateRow[] = await res.json()
      setTemplates(data)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function selectTemplate(t: TemplateRow) {
    setSelected(t)
    setDraft(t.content)
    setDirty(false)
    setSaved(false)
    setError('')
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/${encodeURIComponent(selected.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setDirty(false)
      setTemplates(ts => ts.map(t => t.key === selected.key ? { ...t, content: draft, updated_at: new Date().toISOString() } : t))
      setSelected(s => s ? { ...s, content: draft } : s)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!selected) return
    setResetting(true)
    setError('')
    try {
      const res = await fetch(`/api/v2/scaffold/templates/${encodeURIComponent(selected.key)}/reset`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
      // Re-select after reload
      const res2 = await fetch(`/api/v2/scaffold/templates/${encodeURIComponent(selected.key)}`)
      if (res2.ok) {
        const t: TemplateRow = await res2.json()
        selectTemplate(t)
      }
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setResetting(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Left panel: template list ── */}
      <div style={{
        width: '280px', flexShrink: 0, borderRight: '1px solid var(--sapList_BorderColor)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)' }}>
          <Title level="H5" style={{ margin: 0 }}>Adapter Templates</Title>
          <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginTop: '0.25rem' }}>
            BPMN fragments used when scaffolding iFlows
          </div>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <BusyIndicator active />
          </div>
        )}

        {!loading && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            {templates.map(t => (
              <div
                key={t.key}
                onClick={() => selectTemplate(t)}
                style={{
                  padding: '0.6rem 1rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--sapList_BorderColor)',
                  background: selected?.key === t.key ? 'var(--sapList_SelectionBackgroundColor)' : 'transparent',
                }}
              >
                <div style={{ fontFamily: 'var(--sapFontMonospaceFamily, monospace)', fontSize: '0.75rem', fontWeight: 600 }}>{t.key}</div>
                {t.description && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', marginTop: '0.15rem' }}>{t.description}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: editor ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected && !loading && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem',
          }}>
            Select a template to edit
          </div>
        )}

        {selected && (
          <>
            {/* toolbar */}
            <div style={{
              padding: '0.5rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)',
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  fontFamily: 'var(--sapFontMonospaceFamily, monospace)',
                  fontSize: '0.875rem', fontWeight: 600,
                }}>{selected.key}</span>
                {selected.description && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
                    — {selected.description}
                  </span>
                )}
                <span style={{ marginLeft: '0.75rem', fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)' }}>
                  updated {relTime(selected.updated_at)}
                </span>
              </div>
              <FlexBox style={{ gap: '0.5rem' }}>
                <Button
                  design="Transparent"
                  onClick={reset}
                  disabled={resetting || saving}
                >
                  {resetting ? 'Resetting…' : 'Reset to Default'}
                </Button>
                <Button
                  design="Emphasized"
                  onClick={save}
                  disabled={!dirty || saving}
                >
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
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                }}
                onChange={(val) => {
                  setDraft(val ?? '')
                  setDirty((val ?? '') !== selected.content)
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
