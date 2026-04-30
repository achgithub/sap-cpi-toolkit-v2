-- Systems: add hosting info
ALTER TABLE systems ADD COLUMN infra_type   TEXT NOT NULL DEFAULT '';
ALTER TABLE systems ADD COLUMN infra_region TEXT NOT NULL DEFAULT '';

-- Interfaces: drop firewall_zone, add edge style + integration platform
ALTER TABLE interfaces DROP COLUMN firewall_zone;
ALTER TABLE interfaces ADD COLUMN edge_style           TEXT NOT NULL DEFAULT 'solid';
ALTER TABLE interfaces ADD COLUMN edge_routing         TEXT NOT NULL DEFAULT 'bezier';
ALTER TABLE interfaces ADD COLUMN integration_platform TEXT NOT NULL DEFAULT '';

-- Receivers: drop firewall_zone
ALTER TABLE interface_receivers DROP COLUMN firewall_zone;

-- Global config for the registry (system types, infra types, integration platforms)
CREATE TABLE registry_config (
    key        TEXT        PRIMARY KEY,
    value      JSONB       NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO registry_config (key, value) VALUES
('system_types', '[
  {"name": "SAP S/4HANA",       "color": "#0070F2"},
  {"name": "SAP ERP",           "color": "#427CAC"},
  {"name": "SAP BTP",           "color": "#FA8231"},
  {"name": "Salesforce",        "color": "#00A1E0"},
  {"name": "External Partner",  "color": "#5C6BC0"},
  {"name": "Internal System",   "color": "#43A047"},
  {"name": "Database",          "color": "#8D6E63"},
  {"name": "Custom",            "color": "#78909C"}
]'),
('infra_types', '[
  {"name": "AWS",     "category": "cloud"},
  {"name": "Azure",   "category": "cloud"},
  {"name": "GCP",     "category": "cloud"},
  {"name": "SAP BTP", "category": "cloud"},
  {"name": "On-Prem", "category": "on_prem"},
  {"name": "Hybrid",  "category": "hybrid"}
]'),
('integration_platforms', '[
  {"name": "SAP CPI"},
  {"name": "SAP PI/PO"},
  {"name": "MuleSoft"},
  {"name": "Azure Integration Services"},
  {"name": "AWS EventBridge"},
  {"name": "SFTP"},
  {"name": "Direct API"},
  {"name": "Custom"}
]')
ON CONFLICT (key) DO NOTHING;
