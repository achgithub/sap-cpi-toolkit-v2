import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, FlexBox, FlexBoxAlignItems, FlexBoxJustifyContent, Input, MessageStrip, Option, Select, type InputDomRef } from '@ui5/webcomponents-react'
import { useWorkspace } from '../../context/WorkspaceContext'

interface IntegrationArtifact {
  Id: string; Name: string; Type: string; PackageId: string; PackageName: string
}

interface Message {
  MessageGuid: string
  CorrelationId: string
  ApplicationMessageId: string | null
  Status: string
  LogStart: string
  LogEnd: string
  IntegrationFlowName: string | null
  IntegrationArtifact: IntegrationArtifact | null
}

interface ErrorInfo { Type: string; Last: string }

interface MessagePage { messages: Message[]; total: number }

const TIME_RANGES  = ['Past Hour', 'Past 4 Hours', 'Past Day', 'Past Week']
const STATUSES     = ['', 'COMPLETED', 'FAILED', 'RETRY', 'PROCESSING', 'ESCALATED']
const STATUS_LABELS: Record<string, string> = {
  '': 'All', COMPLETED: 'Completed', FAILED: 'Failed',
  RETRY: 'Retry', PROCESSING: 'Processing', ESCALATED: 'Escalated',
}
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#107e3e', FAILED: '#bb0000', RETRY: '#e9730c',
  PROCESSING: '#0064d9', ESCALATED: '#6a2194',
}
const STATUS_BG: Record<string, string> = {
  COMPLETED: '#eaf5ea', FAILED: '#ffeaea', RETRY: '#fff3e0',
  PROCESSING: '#e8f4fd', ESCALATED: '#f3e8ff',
}

const PAGE_SIZE = 50

function parseCPIDate(raw: string): string {
  const m = raw.match(/\/Date\((\d+)\)\//)
  if (!m) return raw
  return new Date(parseInt(m[1])).toLocaleString()
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v2${path}`)
  const data = await res.json() as T
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText)
  return data
}

interface Props {
  defaultTimeRange?: string
  defaultStatus?: string
  focusSearch?: boolean
  presetIdSearch?: string
}

export default function MessageList({ defaultTimeRange = 'Past Hour', defaultStatus = '', focusSearch, presetIdSearch = '' }: Props) {
  const { selectedInstance } = useWorkspace()

  const [timeRange, setTimeRange] = useState(defaultTimeRange)
  const [status,    setStatus]    = useState(defaultStatus)
  const [packageId, setPackageId] = useState('')
  const [iFlowId,   setIFlowId]   = useState('')
  const [idSearch,  setIdSearch]  = useState(presetIdSearch)
  const [messages,  setMessages]  = useState<Message[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [selected,  setSelected]  = useState<Message | null>(null)
  const [errInfo,   setErrInfo]   = useState<ErrorInfo | null>(null)
  const [errLoading,setErrLoading]= useState(false)

  const searchRef = useRef<InputDomRef>(null)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async (pg: number, tr: string, st: string, pkg: string, flow: string, ids: string) => {
    if (!selectedInstance) return
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({
        top: String(PAGE_SIZE), skip: String((pg - 1) * PAGE_SIZE),
        time_range: tr, status: st, package_id: pkg, iflow_id: flow, id_search: ids,
      })
      const data = await apiFetch<MessagePage>(`/monitoring/${selectedInstance.id}/messages?${params}`)
      setMessages(data.messages ?? [])
      setTotal(data.total ?? 0)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [selectedInstance])

  useEffect(() => {
    setPage(1); setSelected(null)
    load(1, timeRange, status, packageId, iFlowId, idSearch)
  }, [timeRange, status, packageId, iFlowId, idSearch, load])

  useEffect(() => {
    if (focusSearch && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100)
    }
  }, [focusSearch])

  async function loadDetail(msg: Message) {
    setSelected(msg); setErrInfo(null)
    if (msg.Status === 'FAILED' && selectedInstance) {
      setErrLoading(true)
      try {
        const info = await apiFetch<ErrorInfo | null>(`/monitoring/${selectedInstance.id}/messages/${msg.MessageGuid}/error`)
        setErrInfo(info)
      } catch { /* ignore */ }
      finally { setErrLoading(false) }
    }
  }

  function changePage(pg: number) {
    setPage(pg)
    load(pg, timeRange, status, packageId, iFlowId, idSearch)
  }

  if (!selectedInstance) {
    return (
      <div style={{ padding: '2rem' }}>
        <MessageStrip design="Critical" hideCloseButton>No instance selected. Choose one from the context bar.</MessageStrip>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Filter bar */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapList_Background)', flexShrink: 0 }}>
        <FlexBox alignItems={FlexBoxAlignItems.End} style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <FilterField label="Time">
            <Select style={{ minWidth: '130px' }} onChange={e => setTimeRange((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
              {TIME_RANGES.map(t => <Option key={t} value={t} selected={timeRange === t}>{t}</Option>)}
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select style={{ minWidth: '120px' }} onChange={e => setStatus((e.detail as { selectedOption: { value: string } }).selectedOption.value)}>
              {STATUSES.map(s => <Option key={s} value={s} selected={status === s}>{STATUS_LABELS[s]}</Option>)}
            </Select>
          </FilterField>
          <FilterField label="Package ID">
            <Input value={packageId} placeholder="All packages" disabled={!!iFlowId}
              style={{ minWidth: '140px', opacity: iFlowId ? 0.4 : 1 }}
              onInput={e => { setPackageId((e.target as unknown as HTMLInputElement).value); setIFlowId('') }} />
          </FilterField>
          <FilterField label="iFlow ID">
            <Input value={iFlowId} placeholder="All iFlows" disabled={!!packageId}
              style={{ minWidth: '140px', opacity: packageId ? 0.4 : 1 }}
              onInput={e => { setIFlowId((e.target as unknown as HTMLInputElement).value); setPackageId('') }} />
          </FilterField>
          <FilterField label="Message / Correlation ID">
            <Input ref={searchRef} value={idSearch} placeholder="Search by ID…" style={{ minWidth: '180px' }}
              onInput={e => setIdSearch((e.target as unknown as HTMLInputElement).value)} />
          </FilterField>
          <Button icon="refresh" design="Transparent" onClick={() => load(page, timeRange, status, packageId, iFlowId, idSearch)} />
        </FlexBox>
      </div>

      {/* Table header row */}
      <div style={{ padding: '0.4rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)', flexShrink: 0 }}>
        <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'var(--sapFontFamily)' }}>
            Messages ({loading ? '…' : total.toLocaleString()})
          </span>
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.125rem' }}>
            <Button icon="close" design="Transparent" disabled={page <= 1} onClick={() => changePage(1)} />
            <Button icon="navigation-left-arrow" design="Transparent" disabled={page <= 1} onClick={() => changePage(page - 1)} />
            <span style={{ fontSize: '0.8rem', fontFamily: 'var(--sapFontFamily)', padding: '0 0.4rem' }}>{page} / {totalPages}</span>
            <Button icon="navigation-right-arrow" design="Transparent" disabled={page >= totalPages} onClick={() => changePage(page + 1)} />
            <Button icon="open" design="Transparent" disabled={page >= totalPages} onClick={() => changePage(totalPages)} />
          </FlexBox>
        </FlexBox>
      </div>

      {error && <MessageStrip design="Negative" style={{ margin: '0.5rem 1rem', flexShrink: 0 }} onClose={() => setError('')}>{error}</MessageStrip>}

      {/* Main area: list + optional detail */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Message list */}
        <div style={{ flex: selected ? '0 0 45%' : '1', overflowY: 'auto', borderRight: selected ? '1px solid var(--sapList_BorderColor)' : 'none' }}>
          <ColHeader />
          {loading && <EmptyMsg>Loading…</EmptyMsg>}
          {!loading && messages.length === 0 && <EmptyMsg>No messages found — adjust filters</EmptyMsg>}
          {messages.map(msg => (
            <div
              key={msg.MessageGuid}
              onClick={() => loadDetail(msg)}
              style={{
                ...GRID_STYLE,
                padding: '0.5rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)',
                fontSize: '0.8rem', fontFamily: 'var(--sapFontFamily)',
                background: selected?.MessageGuid === msg.MessageGuid ? 'var(--sapList_SelectionBackgroundColor)' : 'var(--sapList_Background)',
                cursor: 'pointer', alignItems: 'start',
              }}
            >
              <div style={{ minWidth: 0, paddingRight: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={msg.IntegrationArtifact?.Name ?? msg.IntegrationFlowName ?? msg.MessageGuid}>
                  {msg.IntegrationArtifact?.Name ?? msg.IntegrationFlowName ?? msg.MessageGuid}
                </span>
                <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                  {msg.IntegrationArtifact?.Id        && <CopyChip label="iFlow" value={msg.IntegrationArtifact.Id} />}
                  {msg.IntegrationArtifact?.PackageId && <CopyChip label="Pkg"   value={msg.IntegrationArtifact.PackageId} />}
                </div>
              </div>
              <StatusBadge status={msg.Status} />
              <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.73rem' }}>{parseCPIDate(msg.LogStart)}</span>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ flex: '0 0 55%', overflowY: 'auto', background: 'var(--sapGroup_ContentBackground)', padding: '1rem' }}>
            <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} alignItems={FlexBoxAlignItems.Center} style={{ marginBottom: '1rem' }}>
              <StatusBadge status={selected.Status} />
              <Button icon="decline" design="Transparent" onClick={() => setSelected(null)} />
            </FlexBox>
            <DetailRow label="iFlow"         value={selected.IntegrationArtifact?.Name ?? '—'} />
            <DetailRow label="iFlow ID"      value={selected.IntegrationArtifact?.Id ?? '—'} copy />
            <DetailRow label="Package"       value={selected.IntegrationArtifact?.PackageName ?? '—'} />
            <DetailRow label="Package ID"    value={selected.IntegrationArtifact?.PackageId ?? '—'} copy />
            <DetailRow label="Message GUID"  value={selected.MessageGuid} copy />
            <DetailRow label="Correlation ID" value={selected.CorrelationId ?? '—'} copy />
            {selected.ApplicationMessageId && <DetailRow label="App Message ID" value={selected.ApplicationMessageId} copy />}

            <DetailRow label="Start"         value={parseCPIDate(selected.LogStart)} />
            <DetailRow label="End"           value={parseCPIDate(selected.LogEnd)} />

            {selected.Status === 'FAILED' && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--sapErrorBackground)', border: '1px solid var(--sapErrorBorderColor)', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--sapErrorColor)', fontFamily: 'var(--sapFontFamily)', marginBottom: '0.25rem' }}>Error</div>
                {errLoading && <span style={{ fontSize: '0.8rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapContent_LabelColor)' }}>Loading…</span>}
                {errInfo && <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--sapErrorColor)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{errInfo.Last || errInfo.Type}</div>}
                {!errLoading && !errInfo && <span style={{ fontSize: '0.8rem', fontFamily: 'var(--sapFontFamily)', color: 'var(--sapContent_LabelColor)' }}>No error detail available</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginBottom: '0.2rem' }}>{label}</div>
      {children}
    </div>
  )
}

const GRID = '3fr 120px 160px'
const GRID_STYLE: React.CSSProperties = { display: 'grid', gridTemplateColumns: GRID, columnGap: '1rem' }

function ColHeader() {
  return (
    <div style={{ ...GRID_STYLE, padding: '0.4rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapList_HeaderBackground)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
      <span>Artifact / Package</span><span>Status</span><span>Start</span>
    </div>
  )
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>{children}</div>
}

function DetailRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem 0', borderBottom: '1px solid var(--sapList_BorderColor)', alignItems: 'baseline' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', minWidth: '120px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--sapTextColor)', wordBreak: 'break-all', flex: 1 }}>{value}</span>
      {copy && value !== '—' && (
        <button
          onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: copied ? 'var(--sapSuccessColor)' : 'var(--sapContent_LabelColor)', flexShrink: 0, padding: '0 0.25rem' }}
        >{copied ? '✓' : 'Copy'}</button>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'var(--sapTextColor)'
  const bg    = STATUS_BG[status]    ?? 'var(--sapNeutralBackground)'
  return (
    <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '3px', background: bg, color, border: `1px solid ${color}`, fontFamily: 'var(--sapFontFamily)', whiteSpace: 'nowrap' }}>
      {status}
    </span>
  )
}

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      title={`Copy: ${value}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.68rem', fontFamily: 'monospace', padding: '0.1rem 0.35rem', borderRadius: '3px', cursor: 'pointer', background: copied ? 'var(--sapSuccessBackground)' : 'var(--sapNeutralBackground)', color: copied ? 'var(--sapSuccessColor)' : 'var(--sapContent_LabelColor)', border: `1px solid ${copied ? 'var(--sapSuccessBorderColor)' : 'var(--sapNeutralBorderColor)'}`, userSelect: 'none', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontWeight: 600 }}>{label}:</span> {copied ? '✓' : value}
    </span>
  )
}
