import { useState, useEffect } from 'react'
import {
  Dialog, Bar, Button, Input, Label, Select, Option, MessageStrip, BusyIndicator,
} from '@ui5/webcomponents-react'
import type { InputDomRef } from '@ui5/webcomponents-react'
import { useWorkspace } from '../context/WorkspaceContext'

const ASSET_TYPES = ['xml', 'json', 'groovy', 'xsd', 'xslt', 'request', 'payload', 'snippet', 'cert', 'other']

interface Props {
  open: boolean
  content: string
  defaultName?: string
  defaultType?: string
  meta?: Record<string, unknown>
  allowEditContent?: boolean
  onClose: () => void
  onSaved?: () => void
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--sapFontFamily)', fontSize: '0.8rem',
  color: 'var(--sapContent_LabelColor)', display: 'block', marginBottom: '0.2rem',
}

export default function SaveAssetDialog({
  open, content, defaultName = '', defaultType = 'snippet',
  meta, allowEditContent = false, onClose, onSaved,
}: Props) {
  const { selectedProject, subProjects, selectedSubProject } = useWorkspace()

  const [name,          setName]          = useState(defaultName)
  const [assetType,     setAssetType]     = useState(defaultType)
  const [editedContent, setEditedContent] = useState(content)
  const [pinProject,    setPinProject]    = useState(!!selectedProject)
  const [pinSubProject, setPinSubProject] = useState(false)
  const [busy,          setBusy]          = useState(false)
  const [error,         setError]         = useState('')
  const [saved,         setSaved]         = useState(false)
  const [duplicate,     setDuplicate]     = useState(false)

  useEffect(() => {
    if (open) {
      setName(defaultName)
      setAssetType(defaultType)
      setEditedContent(content)
      setPinProject(!!selectedProject)
      setPinSubProject(false)
      setError('')
      setSaved(false)
      setDuplicate(false)
    }
  }, [open, defaultName, defaultType, content, selectedProject])

  const activeContent = allowEditContent ? editedContent : content

  async function save(overwrite = false) {
    if (!name.trim()) return
    setBusy(true); setError(''); setDuplicate(false)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        type: assetType,
        content: activeContent,
        meta: meta ?? {},
        project_id:     pinProject && selectedProject ? selectedProject.id : null,
        sub_project_id: pinProject && pinSubProject && selectedSubProject ? selectedSubProject.id : null,
      }
      const url = overwrite ? '/api/v2/assets?overwrite=true' : '/api/v2/assets'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 409) {
        setDuplicate(true)
        return
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      setSaved(true)
      onSaved?.()
      setTimeout(() => { onClose(); setSaved(false) }, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} headerText="Save as Asset"
      style={{ width: allowEditContent ? '560px' : '420px' }}
      onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>

        {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}
        {duplicate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <MessageStrip design="Critical" hideCloseButton>
              An asset named <strong>"{name.trim()}"</strong> ({assetType}) already exists.
            </MessageStrip>
            <Button design="Negative" onClick={() => save(true)}>Overwrite existing</Button>
          </div>
        )}

        <div>
          <Label style={labelStyle}>Name *</Label>
          <Input value={name} placeholder="e.g. Order payload XML" style={{ width: '100%' }}
            onInput={e => setName((e.target as unknown as InputDomRef).value ?? '')} />
        </div>

        <div>
          <Label style={labelStyle}>Type</Label>
          <Select style={{ width: '100%' }}
            onChange={e => setAssetType((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
            {ASSET_TYPES.map(t => <Option key={t} value={t} selected={t === assetType}>{t}</Option>)}
          </Select>
        </div>

        {allowEditContent && (
          <div>
            <Label style={labelStyle}>Content</Label>
            <textarea
              value={editedContent}
              onChange={e => setEditedContent(e.target.value)}
              placeholder="Paste or type content here…"
              style={{
                width: '100%', boxSizing: 'border-box', minHeight: '160px',
                fontFamily: 'monospace', fontSize: '0.82rem',
                background: 'var(--sapNeutralBackground)',
                border: '1px solid var(--sapList_BorderColor)',
                borderRadius: '4px', padding: '0.5rem',
                color: 'var(--sapTextColor)', resize: 'vertical',
              }}
            />
          </div>
        )}

        {selectedProject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
              fontFamily: 'var(--sapFontFamily)', fontSize: '0.82rem', color: 'var(--sapTextColor)' }}>
              <input type="checkbox" checked={pinProject} onChange={e => setPinProject(e.target.checked)} />
              Tag to project: <strong>{selectedProject.name}</strong>
            </label>
            {pinProject && subProjects.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
                fontFamily: 'var(--sapFontFamily)', fontSize: '0.82rem', color: 'var(--sapTextColor)',
                marginLeft: '1.25rem' }}>
                <input type="checkbox" checked={pinSubProject} onChange={e => setPinSubProject(e.target.checked)} />
                Also tag to sub-project:
                {selectedSubProject
                  ? <strong>{selectedSubProject.name}</strong>
                  : <span style={{ color: 'var(--sapContent_LabelColor)' }}> (current selection)</span>}
              </label>
            )}
          </div>
        )}

        {!allowEditContent && (
          <div style={{ fontFamily: 'var(--sapFontFamily)', fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>
            Content: {content.length.toLocaleString()} characters
          </div>
        )}
      </div>

      <Bar slot="footer">
        <BusyIndicator slot="startContent" active={busy} />
        <Button slot="endContent" design="Emphasized"
          disabled={!name.trim() || !activeContent.trim() || busy || saved || duplicate}
          onClick={() => save()}>
          {saved ? 'Saved!' : 'Save'}
        </Button>
        <Button slot="endContent" design="Transparent" onClick={onClose}>Cancel</Button>
      </Bar>
    </Dialog>
  )
}
