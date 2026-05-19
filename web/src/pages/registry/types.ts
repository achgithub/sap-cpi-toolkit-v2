export interface System {
  id:               string
  name:             string
  system_type:      string
  infra_type:       string
  infra_region:     string
  description:      string
  owner_type:       string
  managed_by:       string
  deployment_type:  string
  owner:            string
  lifecycle_status: string
  vendor:           string
  pos_x:            number
  pos_y:            number
}

export interface LogicalGroup {
  id:          string
  name:        string
  description: string
}

export interface ViaHop {
  label:     string
  system_id?: string
}

export interface Receiver {
  id:               string
  interface_id:     string
  system_id:        string | null
  transport:        string
  auth_type:        string
  credential_alias: string
  via:              ViaHop[]
}

export interface Interface {
  id:                  string
  name:                string
  ref:                 string
  build_ref:           string
  status:              'design' | 'dev' | 'test' | 'active' | 'deprecated'
  interface_type:      'point_to_point' | 'broadcast' | 'shared_library' | 'utility'
  sender_system_id:    string | null
  logical_group_id:    string | null
  sequence_in_group:   number | null
  sender_step_label:   string
  receiver_step_label: string
  functional_domain:   string
  via:                 ViaHop[]
  delivery_project_id: string | null
  description:         string
  receivers:           Receiver[]
}

export interface Dependency {
  id:             string
  interface_id:   string
  depends_on_id:  string
  depends_on_ref: string
  depends_on_name: string
  kind:           'chains_to' | 'triggers' | 'shares_data'
  note:           string
}

// Architecture diagram edge (pre-aggregated by backend)
export interface DiagramEdge {
  sender_system_id:   string
  receiver_system_id: string
  count:              number
  refs:               string[]
  statuses:           string[]
}

export interface SystemTypeConfig { name: string; color: string }
export interface InfraTypeConfig  { name: string; category: 'cloud' | 'on_prem' | 'hybrid' }
export interface PlatformConfig   { name: string; color: string }

export interface RegistryConfig {
  systemTypes:  SystemTypeConfig[]
  infraTypes:   InfraTypeConfig[]
  platforms:    PlatformConfig[]
}

export const STATUSES        = ['design', 'dev', 'test', 'active', 'deprecated'] as const
export const INTERFACE_TYPES = ['point_to_point', 'broadcast', 'shared_library', 'utility'] as const
export const OWNER_TYPES     = ['internal', 'partner', 'external'] as const
export const TRANSPORTS      = ['', 'HTTP', 'SFTP', 'RFC', 'IDoc', 'AS2', 'JDBC', 'AMQP', 'SOAP'] as const
export const AUTH_TYPES      = ['', 'None', 'Basic', 'OAuth2', 'ClientCert', 'APIKey'] as const

export const STATUS_COLORS: Record<string, string> = {
  design:     'var(--sapInformativeColor)',
  dev:        'var(--sapWarningColor)',
  test:       '#9b59b6',
  active:     'var(--sapPositiveColor)',
  deprecated: 'var(--sapNegativeColor)',
}

export const TYPE_LABELS: Record<string, string> = {
  point_to_point: 'P2P',
  broadcast:      'Broadcast',
  shared_library: 'Library',
  utility:        'Utility',
}

export const DEFAULT_SYSTEM_COLOR = '#78909C'

export function getSystemColor(systemType: string, config: RegistryConfig | { systemTypes: SystemTypeConfig[] }): string {
  return config.systemTypes.find(t => t.name === systemType)?.color ?? DEFAULT_SYSTEM_COLOR
}

export interface DiagramFilter {
  systemIds:         string[]
  infraTypes:        string[]
  statuses:          string[]
  functionalDomain:  string[]
  lifecycleStatuses: string[]
  deliveryProjectId: string
  strict:            boolean
}

export const emptyFilter = (): DiagramFilter => ({
  systemIds: [], infraTypes: [], statuses: [],
  functionalDomain: [], lifecycleStatuses: [], deliveryProjectId: '', strict: true,
})

// Lifecycle status constants and visual config
export const LIFECYCLE_STATUSES = [
  { value: 'active',          label: 'Active',          color: '#43A047' },
  { value: 'planned',         label: 'Planned',         color: '#6B7280' },
  { value: 'retiring',        label: 'Retiring',        color: '#F59E0B' },
  { value: 'decommissioned',  label: 'Decommissioned',  color: '#9E9E9E' },
] as const

export function lifecycleColor(status: string): string {
  return LIFECYCLE_STATUSES.find(l => l.value === status)?.color ?? '#43A047'
}
