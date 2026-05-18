-- Integration components — middleware and tools (SAP CPI, MuleSoft, SFTP, etc.)
-- Separate from business systems. Referenced by v2 via hops and trigger fields.

CREATE TABLE integration_components (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT         NOT NULL,
    component_type TEXT         NOT NULL DEFAULT '',
    infra_type     TEXT         NOT NULL DEFAULT '',
    infra_region   TEXT         NOT NULL DEFAULT '',
    description    TEXT         NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed component types into registry_config (add key, don't touch existing keys)
INSERT INTO registry_config (key, value) VALUES
('component_types', '[
    {"name":"SAP Integration Suite", "color":"#0070F2"},
    {"name":"SAP PI/PO",             "color":"#427CAC"},
    {"name":"MuleSoft",              "color":"#00A1E0"},
    {"name":"Azure Integration",     "color":"#00A4EF"},
    {"name":"AWS EventBridge",       "color":"#FF9900"},
    {"name":"SFTP",                  "color":"#43A047"},
    {"name":"API Gateway",           "color":"#7B1FA2"},
    {"name":"Message Queue",         "color":"#E65100"},
    {"name":"Event Bus",             "color":"#E65100"},
    {"name":"Custom",                "color":"#78909C"}
]'::jsonb)
ON CONFLICT (key) DO NOTHING;
