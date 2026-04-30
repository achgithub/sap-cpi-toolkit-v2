export interface IFSystem {
  id: string
  project_id: string
  name: string
  description: string
  system_type: string
  infra_type: string
  infra_region: string
  pos_x: number
  pos_y: number
}

export interface IFReceiver {
  id: string
  interface_id: string
  system_id: string | null
  cpi_iflow_id: string
  transport: string
  auth_type: string
  credential_alias: string
  meta: Record<string, string>
}

export interface IFInterface {
  id: string
  project_id: string
  name: string
  description: string
  interface_type: 'point_to_point' | 'broadcast' | 'shared_library' | 'utility'
  status: 'design' | 'dev' | 'test' | 'active' | 'deprecated'
  sender_system_id: string | null
  integration_platform: string
  cpi_package_id: string
  cpi_iflow_id: string
  transport: string
  auth_type: string
  credential_alias: string
  edge_style: 'solid' | 'dashed' | 'dotted'
  edge_routing: 'bezier' | 'straight' | 'smoothstep'
  debug_trigger_enabled: boolean
  debug_trigger_method: string
  debug_trigger_path: string
  debug_trigger_payload: string
  meta: Record<string, string>
  receivers: IFReceiver[]
}

// Config types (from registry_config table)
export interface SystemTypeConfig  { name: string; color: string }
export interface InfraTypeConfig   { name: string; category: 'cloud' | 'on_prem' | 'hybrid' }
export interface PlatformConfig    { name: string }

export interface RegistryConfig {
  systemTypes:  SystemTypeConfig[]
  infraTypes:   InfraTypeConfig[]
  platforms:    PlatformConfig[]
}

export const INTERFACE_TYPES = ['point_to_point', 'broadcast', 'shared_library', 'utility'] as const
export const STATUSES        = ['design', 'dev', 'test', 'active', 'deprecated'] as const
export const TRANSPORTS      = ['', 'HTTP', 'SFTP', 'RFC', 'IDoc', 'AS2', 'JDBC', 'AMQP', 'SOAP'] as const
export const AUTH_TYPES      = ['', 'None', 'Basic', 'OAuth2', 'ClientCert', 'APIKey'] as const
export const EDGE_STYLES     = ['solid', 'dashed', 'dotted'] as const
export const EDGE_ROUTINGS   = ['bezier', 'straight', 'smoothstep'] as const

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

export function getSystemColor(systemType: string, config: RegistryConfig): string {
  return config.systemTypes.find(t => t.name === systemType)?.color ?? DEFAULT_SYSTEM_COLOR
}
