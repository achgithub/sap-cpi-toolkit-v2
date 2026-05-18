-- Migrate V1 interfaces → V2 tables
-- Maps V1 system-based via hops to V2 integration components
-- Maps status: live → active
-- Infers interaction_pattern from descriptions/names
-- Safe to re-run: checks for existing refs before inserting

DO $$
DECLARE
  -- V1 system IDs used as integration hops (wrong model — these are components)
  v1_cpi_sys_id  UUID := '6c3cefd2-d86b-44be-b35a-281461494eef'; -- SAP Cloud Integration (system)
  v1_po_sys_id   UUID := 'bcd683a3-eb21-4c2d-9749-eeeb8b8187c9'; -- SAP Process Orchestration (system)
  v1_sftp_sys_id UUID := '292b4ead-30ad-4bd1-8ab2-758e13594e89'; -- SFTP File Gateway (system)

  -- V2 component IDs
  cpi_prd_id  UUID := 'a1226ab5-8dbe-47ad-9395-530a1aa1569c'; -- SAP CPI PRD
  sftp_id     UUID := 'bb085cd3-1fcf-4a57-8af9-791976dc176d'; -- SFTP Gateway PRD
  po_id       UUID;

  -- Helper vars
  iface_id UUID;

BEGIN

-- ── Create SAP PI/PO PRD component (not in V2 yet) ───────────────────────────
INSERT INTO integration_components (name, component_type, infra_type, infra_region, description)
VALUES ('SAP PI/PO PRD', 'SAP PI/PO', 'On-Prem', 'Frankfurt DC', 'Legacy SAP Process Orchestration — being phased out in favour of CPI')
RETURNING id INTO po_id;

RAISE NOTICE 'SAP PI/PO PRD component: %', po_id;

-- ── Helper: map V1 system_id to V2 component_id in a via JSONB array ──────────
-- Called inline using a SQL expression — no function, just CASE in the SELECT.

-- ── Migrate interfaces ────────────────────────────────────────────────────────
-- For each V1 interface: map sender_system_id → trigger_system_id,
-- convert via hops (system_id → component_id), infer interaction_pattern.

-- 1. IF-S4-SF-01  Customer Master → Salesforce Account
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-01');

-- Receiver
INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-01'),
  r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-01'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-01');

-- 2. IF-S4-SF-02  Sales Order Confirmation → Salesforce
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-02' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-02');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-02'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-02'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-02');

-- 3. IF-S4-SF-03  Material Catalog → Salesforce Product
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-03' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-03');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-03'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-03'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-03');

-- 4. IF-S4-SF-04  Pricing Conditions → Salesforce Pricebook
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-04' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-04');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-04'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-04'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-04');

-- 5. IF-S4-SF-05  Delivery Status → Salesforce
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-05' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-05');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-05'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-05'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-05');

-- 6. IF-S4-SF-06  Invoice Posted → Salesforce
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-06' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-06');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-06'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-06'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-06');

-- 7. IF-S4-SF-07  Contract Replication → Salesforce (via PI/PO on receiver)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-07' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-07');

-- V1 receiver had PI/PO as a via hop — now a component hop in V2 receiver via
INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-07'),
  r.system_id, 'HTTP', r.auth_type, '',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP PI/PO PRD','component_id',po_id))
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-07'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-07');

-- 8. IF-S4-SF-08  Payment Terms → Salesforce Account
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-08' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-08');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-08'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-08'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-08');

-- 9. IF-S4-SF-09  Returns & Credit Memo → Salesforce Case
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SF-09' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SF-09');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SF-09'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SF-09'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SF-09');

-- 10. IF-SF-S4-01  Credit Limit Check ← Salesforce (SYNC — Salesforce calls S/4 directly)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'sync',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-SF-S4-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-SF-S4-01');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-SF-S4-01'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-SF-S4-01'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-SF-S4-01');

-- 11. IF-SF-S4-02  Quote Accepted → Sales Order
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'sync',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-SF-S4-02' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-SF-S4-02');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-SF-S4-02'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-SF-S4-02'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-SF-S4-02');

-- 12. IF-SF-S4-03  Opportunity Close → Revenue Recognition
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-SF-S4-03' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-SF-S4-03');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-SF-S4-03'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-SF-S4-03'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-SF-S4-03');

-- 13. IF-WD-S4-01  Employee Master → S/4 HR Mini-Master (CPI scheduled pull from Workday)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_component_id, source_system_id, schedule_expression, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'component_scheduled', cpi_prd_id, sender_system_id, 'Nightly 01:30 UTC', 'scheduled', '[]'
FROM interfaces WHERE ref = 'IF-WD-S4-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-WD-S4-01');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-WD-S4-01'), r.system_id, r.transport, r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-WD-S4-01'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-WD-S4-01');

-- 14. IF-WD-S4-02  Payroll Journal → S/4 FI Posting
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_component_id, source_system_id, schedule_expression, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'component_scheduled', cpi_prd_id, sender_system_id, 'Post payroll run — manual trigger', 'scheduled', '[]'
FROM interfaces WHERE ref = 'IF-WD-S4-02' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-WD-S4-02');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-WD-S4-02'), r.system_id, r.transport, r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-WD-S4-02'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-WD-S4-02');

-- 15. IF-ARB-S4-01  ATP Stock Check ← Ariba (SYNC — Ariba calls S/4 directly, no middleware)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'sync', '[]'
FROM interfaces WHERE ref = 'IF-ARB-S4-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-ARB-S4-01');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-ARB-S4-01'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-ARB-S4-01'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-ARB-S4-01');

-- 16. IF-S4-TAX-01  Tax Code Validation — Direct API (SYNC — S/4 calls external, no middleware)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'sync', '[]'
FROM interfaces WHERE ref = 'IF-S4-TAX-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-TAX-01');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-TAX-01'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-TAX-01'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-TAX-01');

-- 17. IF-S4-SUP-01  Purchase Order → Supplier (Legacy Chain: PI/PO → CPI)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, status, interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(
    jsonb_build_object('type','component','label','SAP PI/PO PRD','component_id',po_id),
    jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id)
  )
FROM interfaces WHERE ref = 'IF-S4-SUP-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SUP-01');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SUP-01'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SUP-01'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SUP-01');

-- 18. IF-S4-SUP-02  Purchase Order → Supplier (Direct CPI — new route)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, status, interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-SUP-02' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-SUP-02');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-SUP-02'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-SUP-02'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-SUP-02');

-- 19. IF-SUP-S4-01  Order Acknowledgement ← Supplier (via PI/PO)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, status, interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP PI/PO PRD','component_id',po_id))
FROM interfaces WHERE ref = 'IF-SUP-S4-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-SUP-S4-01');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-SUP-S4-01'), r.system_id, r.transport, r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-SUP-S4-01'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-SUP-S4-01');

-- 20. IF-S4-INV-01  Inventory Level Update — Broadcast (3 receivers)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-INV-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-INV-01');

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-INV-01'), r.system_id, 'HTTP', r.auth_type, '', '[]'
FROM interface_receivers r JOIN interfaces i ON i.id = r.interface_id WHERE i.ref = 'IF-S4-INV-01'
  AND NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id WHERE iv.ref = 'IF-S4-INV-01');

-- 21. IF-S4-PAY-01  Payment Advice — Mixed Delivery (broadcast: direct API + SFTP)
INSERT INTO interfaces_v2 (name, ref, build_ref, status, interface_type, functional_domain, description,
  trigger_type, trigger_system_id, interaction_pattern, via)
SELECT name, ref, ref, CASE status WHEN 'live' THEN 'active' ELSE status END,
  interface_type, functional_domain, description,
  'system_push', sender_system_id, 'async',
  jsonb_build_array(jsonb_build_object('type','component','label','SAP CPI PRD','component_id',cpi_prd_id))
FROM interfaces WHERE ref = 'IF-S4-PAY-01' AND NOT EXISTS (SELECT 1 FROM interfaces_v2 WHERE ref = 'IF-S4-PAY-01');

-- Receiver A: Supplier Portal — direct from CPI
INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-PAY-01'),
  '59dd5044-b525-404e-a694-ff9b708b73e7', 'HTTP', 'OAuth2', '', '[]'
WHERE NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id
  WHERE iv.ref = 'IF-S4-PAY-01' AND rv.system_id = '59dd5044-b525-404e-a694-ff9b708b73e7');

-- Receiver B: Ariba Network — via SFTP Gateway (legacy)
INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
SELECT (SELECT id FROM interfaces_v2 WHERE ref = 'IF-S4-PAY-01'),
  'e289cd7c-955b-47e6-a23f-4e57267c5a38', 'SFTP', 'SSHKey', '',
  jsonb_build_array(jsonb_build_object('type','component','label','SFTP Gateway PRD','component_id',sftp_id))
WHERE NOT EXISTS (SELECT 1 FROM interface_receivers_v2 rv JOIN interfaces_v2 iv ON iv.id = rv.interface_id
  WHERE iv.ref = 'IF-S4-PAY-01' AND rv.system_id = 'e289cd7c-955b-47e6-a23f-4e57267c5a38');

RAISE NOTICE 'V1 → V2 migration complete. % interfaces migrated.',
  (SELECT count(*) FROM interfaces_v2 WHERE ref LIKE 'IF-%');

END $$;
