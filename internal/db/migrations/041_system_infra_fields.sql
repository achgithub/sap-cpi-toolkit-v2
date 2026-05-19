-- Extend systems with three new infrastructure classification fields.
-- managed_by:      who operates the platform (SAP, Salesforce, Customer, Partner…)
-- deployment_type: how it is deployed (SaaS, RISE, PaaS, IaaS, On-Premises, Colo…)
-- owner:           business team accountable for this system (Finance IT, HR…)
-- All three are config-driven picklists edited in Registry Settings.

ALTER TABLE systems
  ADD COLUMN managed_by     TEXT NOT NULL DEFAULT '',
  ADD COLUMN deployment_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN owner          TEXT NOT NULL DEFAULT '';

-- Seed default picklist values into registry_config.
-- ON CONFLICT DO NOTHING so existing customisations are preserved.
INSERT INTO registry_config (key, value) VALUES
  ('managed_by_types', '[
    {"name":"SAP",         "color":"#1872B8"},
    {"name":"Salesforce",  "color":"#00A1E0"},
    {"name":"Workday",     "color":"#F5951D"},
    {"name":"ServiceNow",  "color":"#62D84E"},
    {"name":"Microsoft",   "color":"#00A4EF"},
    {"name":"Customer",    "color":"#2E7D32"},
    {"name":"Partner",     "color":"#6A1B9A"},
    {"name":"Third-party", "color":"#795548"}
  ]'::jsonb),
  ('deployment_types', '[
    {"name":"SaaS"},
    {"name":"RISE"},
    {"name":"PaaS"},
    {"name":"IaaS"},
    {"name":"On-Premises"},
    {"name":"Colocation"},
    {"name":"Edge"}
  ]'::jsonb),
  ('owner_types', '[
    {"name":"Finance IT"},
    {"name":"HR"},
    {"name":"Sales Operations"},
    {"name":"Procurement"},
    {"name":"Integration CoE"},
    {"name":"IT Shared Services"},
    {"name":"Operations"},
    {"name":"External"}
  ]'::jsonb)
ON CONFLICT (key) DO NOTHING;
