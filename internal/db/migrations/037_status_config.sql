-- Configurable interface statuses for the v2 registry.
-- Stored as registry_config key 'statuses' — same pattern as system_types, infra_types.
-- Colors are hex (not CSS vars) so they are portable outside the browser theme.

INSERT INTO registry_config (key, value) VALUES
('statuses', '[
    {"name":"design",     "color":"var(--sapInformativeColor)"},
    {"name":"dev",        "color":"var(--sapWarningColor)"},
    {"name":"test",       "color":"var(--sapCriticalColor)"},
    {"name":"active",     "color":"var(--sapPositiveColor)"},
    {"name":"deprecated", "color":"var(--sapNegativeColor)"}
]'::jsonb)
ON CONFLICT (key) DO NOTHING;
