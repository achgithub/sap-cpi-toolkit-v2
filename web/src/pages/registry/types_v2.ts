// V2 registry types — new schema with trigger model, typed hops, and integration components.
// Coexists with types.ts (v1). The v1 types drive existing diagrams; these drive the V2 tab.

export interface Component {
  id:             string
  name:           string
  component_type: string
  infra_type:     string
  infra_region:   string
  description:    string
}

export interface APICallout {
  label:         string   // what this call does e.g. "Map Customer Number"
  system_id?:    string   // the business system whose API is being called
  system_label?: string   // denormalised name for display
}

export interface HopV2 {
  type:          'component'
  label:         string        // component name
  component_id?: string
  callouts?:     APICallout[]  // mid-flow API call-outs made by this component (detailed flow only)
}

export interface ReceiverV2 {
  id:               string
  interface_id:     string
  system_id:        string | null
  transport:        string
  auth_type:        string
  credential_alias: string
  via:              HopV2[]
}

export interface InterfaceV2 {
  id:                   string
  name:                 string
  ref:                  string
  build_ref:            string
  status:               StatusV2
  interface_type:       InterfaceTypeV2
  functional_domain:    string
  description:          string
  logical_group_id:     string | null
  sequence_in_group:    number | null
  trigger_type:         TriggerType
  trigger_system_id:    string | null
  trigger_component_id: string | null
  schedule_expression:  string | null
  source_system_id:     string | null
  interaction_pattern:  InteractionPattern
  via:                  HopV2[]
  api_spec_url?:        string | null
  api_auth_scheme?:     string | null
  api_description?:     string | null
  receivers:            ReceiverV2[]
}

export interface FieldDefinition {
  id:            string
  applies_to:    'interface' | 'receiver' | 'both'
  field_key:     string
  label:         string
  data_type:     'text' | 'number' | 'date' | 'boolean' | 'select' | 'url'
  options:       string[]
  required:      boolean
  display_order: number
  description:   string
}

export interface FieldValue {
  definition_id: string
  field_key:     string
  label:         string
  data_type:     string
  value:         string
}

// ── Status config ─────────────────────────────────────────────────────────────

export interface StatusConfig { name: string; color: string }

// Default statuses used before config loads
export const DEFAULT_STATUSES: StatusConfig[] = [
  { name: 'design',     color: 'var(--sapInformativeColor)' },
  { name: 'dev',        color: 'var(--sapWarningColor)'     },
  { name: 'test',       color: 'var(--sapCriticalColor)'    },
  { name: 'active',     color: 'var(--sapPositiveColor)'    },
  { name: 'deprecated', color: 'var(--sapNegativeColor)'    },
]

// ── Enums ─────────────────────────────────────────────────────────────────────

export type StatusV2 = string  // driven by config at runtime
export const STATUSES_V2: StatusV2[] = DEFAULT_STATUSES.map(s => s.name)

export type InterfaceTypeV2 = 'point_to_point' | 'broadcast' | 'shared_library' | 'utility' | 'published_api'
export const INTERFACE_TYPES_V2: InterfaceTypeV2[] = ['point_to_point', 'broadcast', 'shared_library', 'utility', 'published_api']

export type TriggerType = 'system_push' | 'system_scheduled' | 'component_scheduled' | 'component_event' | 'api_inbound'
export const TRIGGER_TYPES: TriggerType[] = ['system_push', 'system_scheduled', 'component_scheduled', 'component_event', 'api_inbound']

export type InteractionPattern = 'sync' | 'async' | 'event' | 'scheduled'
export const INTERACTION_PATTERNS: InteractionPattern[] = ['sync', 'async', 'event', 'scheduled']

export const TRANSPORTS_V2  = ['', 'HTTP', 'SFTP', 'RFC', 'IDoc', 'AS2', 'JDBC', 'AMQP', 'SOAP'] as const
export const AUTH_TYPES_V2  = ['', 'None', 'Basic', 'OAuth2', 'ClientCert', 'APIKey'] as const

// ── Labels ────────────────────────────────────────────────────────────────────

// getStatusColor resolves a status name against the loaded config (falls back to grey)
export function getStatusColor(status: string, statuses: StatusConfig[]): string {
  return statuses.find(s => s.name === status)?.color ?? '#78909C'
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  system_push:         'System Push',
  system_scheduled:    'Scheduled (System)',
  component_scheduled: 'Scheduled (Component)',
  component_event:     'Event (Component)',
  api_inbound:         'API Inbound',
}

export const PATTERN_LABELS: Record<InteractionPattern, string> = {
  sync:      'Synchronous',
  async:     'Asynchronous',
  event:     'Event-driven',
  scheduled: 'Scheduled',
}

export const TYPE_LABELS_V2: Record<InterfaceTypeV2, string> = {
  point_to_point: 'Point to Point',
  broadcast:      'Broadcast',
  shared_library: 'Shared Library',
  utility:        'Utility',
  published_api:  'Published API',
}

// Suggested interaction_pattern given a trigger_type
export const SUGGESTED_PATTERN: Record<TriggerType, InteractionPattern> = {
  system_push:         'async',
  system_scheduled:    'sync',
  component_scheduled: 'scheduled',
  component_event:     'event',
  api_inbound:         'sync',
}
