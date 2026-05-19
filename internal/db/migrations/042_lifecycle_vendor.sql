-- Add lifecycle_status and vendor to systems.
-- lifecycle_status drives integration decisions: Active = build freely,
-- Planned = pre-build allowed, Retiring = no new interfaces / build budget case,
-- Decommissioned = all interfaces should be removed.
-- vendor is free-text (e.g. "SAP", "Salesforce", "Microsoft").

ALTER TABLE systems
  ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN vendor           TEXT NOT NULL DEFAULT '';

-- Replace system_types with functional categories (name = what the system DOES,
-- not the product name — the system name field holds the product name).
-- DO UPDATE to replace any prior product-name entries.
INSERT INTO registry_config (key, value) VALUES
  ('system_types', '[
    {"name":"ERP",                  "color":"#0070F2"},
    {"name":"CRM",                  "color":"#00A1E0"},
    {"name":"Procurement",          "color":"#FA8231"},
    {"name":"HCM",                  "color":"#43A047"},
    {"name":"SCM",                  "color":"#5C6BC0"},
    {"name":"WMS",                  "color":"#427CAC"},
    {"name":"TMS",                  "color":"#00ACC1"},
    {"name":"MES",                  "color":"#8D6E63"},
    {"name":"EAM",                  "color":"#78909C"},
    {"name":"BI / Analytics",       "color":"#7B1FA2"},
    {"name":"MDM",                  "color":"#E53935"},
    {"name":"ITSM",                 "color":"#62D84E"},
    {"name":"T&E",                  "color":"#FB8C00"},
    {"name":"PLM",                  "color":"#8BC34A"},
    {"name":"eCommerce",            "color":"#26A69A"},
    {"name":"Integration Platform", "color":"#FF6B35"},
    {"name":"Identity",             "color":"#546E7A"},
    {"name":"EDI / B2B",            "color":"#795548"},
    {"name":"Bank",                 "color":"#1565C0"},
    {"name":"Logistics Provider",   "color":"#4CAF50"},
    {"name":"Government",           "color":"#37474F"},
    {"name":"Custom / Other",       "color":"#9E9E9E"}
  ]'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
