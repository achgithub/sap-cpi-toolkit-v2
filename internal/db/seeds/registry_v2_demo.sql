-- Registry V2 demo seed
-- Uses existing systems from the systems table.
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING on name uniqueness.

-- ── Known system IDs (from existing data) ────────────────────────────────────
-- SAP S/4HANA Production : ea7e3874-c359-4185-b5b2-4395890bf273
-- OneHR (SuccessFactors) : 6c3e3b91-9219-4121-9a3b-c0ac49ef5b02
-- Salesforce CRM         : cc0a5519-1701-40a3-9b33-4dd8d1b06e34
-- Salesforce             : af873656-4faf-4314-bd7f-70f8986013b0
-- Workday HCM            : 7eac2147-76b2-4757-b8a0-50380ece8d97
-- Ariba Network          : e289cd7c-955b-47e6-a23f-4e57267c5a38
-- Service Now            : a3ebac3c-1588-4f87-b3e5-69fbe08953ad
-- Supplier Portal        : 59dd5044-b525-404e-a694-ff9b708b73e7
-- LegacyDB               : cf4faa5b-ceb4-4493-af2a-598fdaefcd10

DO $$
DECLARE
  -- Integration component IDs
  cpi_prd   UUID;
  sftp_gw   UUID;
  mulesoft  UUID;
  event_bus UUID;
  mdg_api   UUID;

  -- Logical group IDs
  grp_s4_sf UUID;
  grp_hr    UUID;

  -- Interface IDs
  if_cust_create   UUID;
  if_cust_update   UUID;
  if_credit_sync   UUID;
  if_opp_to_order  UUID;
  if_pricing_sync  UUID;
  if_emp_hire_pay  UUID;
  if_po_broadcast  UUID;
  if_sn_event      UUID;
  if_po_api        UUID;
  if_workday_org   UUID;

BEGIN

-- ── Integration Components ────────────────────────────────────────────────────

INSERT INTO integration_components (name, component_type, infra_type, infra_region, description)
VALUES ('SAP CPI', 'SAP Integration Suite', 'SAP BTP', 'EU10', 'Production SAP Cloud Integration tenant')
RETURNING id INTO cpi_prd;

INSERT INTO integration_components (name, component_type, infra_type, infra_region, description)
VALUES ('SFTP Gateway', 'SFTP', 'On-Prem', 'Frankfurt DC', 'On-premise SFTP server for file-based exchanges')
RETURNING id INTO sftp_gw;

INSERT INTO integration_components (name, component_type, infra_type, infra_region, description)
VALUES ('MuleSoft EU Runtime', 'MuleSoft', 'AWS', 'eu-west-1', 'MuleSoft CloudHub runtime — EU region')
RETURNING id INTO mulesoft;

INSERT INTO integration_components (name, component_type, infra_type, infra_region, description)
VALUES ('BTP Event Mesh', 'Event Bus', 'SAP BTP', 'EU10', 'SAP BTP Event Mesh — async event backbone')
RETURNING id INTO event_bus;

INSERT INTO integration_components (name, component_type, infra_type, infra_region, description)
VALUES ('MDG Mapping API', 'API Gateway', 'On-Prem', 'Frankfurt DC', 'Master Data Governance REST API for cross-system ID mapping')
RETURNING id INTO mdg_api;

-- ── Logical Groups ────────────────────────────────────────────────────────────

INSERT INTO logical_groups (name, description)
VALUES ('S/4HANA ↔ Salesforce CRM', 'All interfaces between SAP S/4HANA Production and Salesforce CRM — customer, credit, pricing and opportunity flows')
RETURNING id INTO grp_s4_sf;

INSERT INTO logical_groups (name, description)
VALUES ('HR Integration', 'Employee lifecycle flows from OneHR and Workday into S/4HANA')
RETURNING id INTO grp_hr;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5 interfaces between SAP S/4HANA Production and Salesforce CRM
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Customer Create ──────────────────────────────────────────────────────────
INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  logical_group_id, sequence_in_group,
  trigger_type, trigger_system_id, interaction_pattern,
  via
) VALUES (
  'Customer Create — S/4 to Salesforce', 'CUSTCRE001', 'RICEF-0041',
  'active', 'point_to_point',
  'Order to Cash', 'Replicates new customer master records from S/4HANA to Salesforce CRM on creation. Triggered by a Business Partner created event in S/4.',
  grp_s4_sf, 1,
  'system_push', 'ea7e3874-c359-4185-b5b2-4395890bf273', 'async',
  jsonb_build_array(
    jsonb_build_object('type','component','component_id',cpi_prd,'label','SAP CPI')
  )
) RETURNING id INTO if_cust_create;

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (if_cust_create, 'cc0a5519-1701-40a3-9b33-4dd8d1b06e34', 'HTTP', 'OAuth2', 'sf-cpi-oauth', '[]');

-- 2. Customer Update ──────────────────────────────────────────────────────────
INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  logical_group_id, sequence_in_group,
  trigger_type, trigger_system_id, interaction_pattern,
  via
) VALUES (
  'Customer Update — S/4 to Salesforce', 'CUSTUPD001', 'RICEF-0042',
  'active', 'point_to_point',
  'Order to Cash', 'Replicates changes to existing customer master records. Delta sync — only changed fields are transmitted.',
  grp_s4_sf, 2,
  'system_push', 'ea7e3874-c359-4185-b5b2-4395890bf273', 'async',
  jsonb_build_array(
    jsonb_build_object('type','component','component_id',cpi_prd,'label','SAP CPI')
  )
) RETURNING id INTO if_cust_update;

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (if_cust_update, 'cc0a5519-1701-40a3-9b33-4dd8d1b06e34', 'HTTP', 'OAuth2', 'sf-cpi-oauth', '[]');

-- 3. Credit Limit Sync (Scheduled) ───────────────────────────────────────────
INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  logical_group_id, sequence_in_group,
  trigger_type, trigger_component_id, source_system_id,
  schedule_expression, interaction_pattern,
  via
) VALUES (
  'Credit Limit Sync — S/4 to Salesforce', 'CREDLMT001', 'RICEF-0043',
  'active', 'point_to_point',
  'Order to Cash', 'CPI polls S/4HANA nightly for updated credit limits and pushes them to Salesforce so sales reps see current credit exposure on opportunity records.',
  grp_s4_sf, 3,
  'component_scheduled', cpi_prd, 'ea7e3874-c359-4185-b5b2-4395890bf273',
  'Nightly 01:00 UTC', 'scheduled',
  '[]'
) RETURNING id INTO if_credit_sync;

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (if_credit_sync, 'cc0a5519-1701-40a3-9b33-4dd8d1b06e34', 'HTTP', 'OAuth2', 'sf-cpi-oauth', '[]');

-- 4. Opportunity to Order (Sync — bidirectional feel) ─────────────────────────
INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  logical_group_id, sequence_in_group,
  trigger_type, trigger_system_id, interaction_pattern,
  via
) VALUES (
  'Opportunity to Sales Order — Salesforce to S/4', 'OPP2ORD01', 'RICEF-0044',
  'active', 'point_to_point',
  'Order to Cash', 'When a Salesforce opportunity is marked Closed Won, a sales order is created in S/4HANA synchronously. Salesforce waits for the S/4 order number to display on the opportunity.',
  grp_s4_sf, 4,
  'system_push', 'cc0a5519-1701-40a3-9b33-4dd8d1b06e34', 'sync',
  jsonb_build_array(
    jsonb_build_object('type','component','component_id',cpi_prd,'label','SAP CPI')
  )
) RETURNING id INTO if_opp_to_order;

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (if_opp_to_order, 'ea7e3874-c359-4185-b5b2-4395890bf273', 'HTTP', 'OAuth2', 's4-cpi-oauth', '[]');

-- 5. Pricing & Conditions Sync (Scheduled) ───────────────────────────────────
INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  logical_group_id, sequence_in_group,
  trigger_type, trigger_component_id, source_system_id,
  schedule_expression, interaction_pattern,
  via
) VALUES (
  'Pricing Conditions Sync — S/4 to Salesforce', 'PRICOND01', 'RICEF-0045',
  'dev', 'point_to_point',
  'Order to Cash', 'Exports active pricing conditions (VK11) from S/4 price lists to Salesforce CPQ. Runs twice daily to keep quoting prices current. High volume — ~80k condition records.',
  grp_s4_sf, 5,
  'component_scheduled', cpi_prd, 'ea7e3874-c359-4185-b5b2-4395890bf273',
  'Twice daily — 06:00 and 18:00 UTC', 'scheduled',
  jsonb_build_array(
    jsonb_build_object('type','component','component_id',sftp_gw,'label','SFTP Gateway')
  )
) RETURNING id INTO if_pricing_sync;

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (if_pricing_sync, 'cc0a5519-1701-40a3-9b33-4dd8d1b06e34', 'SFTP', 'Basic', 'sf-sftp-cred', '[]');

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLEX #1 — Employee Hire to Activate
-- CPI scheduled pull from OneHR → S/4HANA with mid-flow MDG API call
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  logical_group_id, sequence_in_group,
  trigger_type, trigger_component_id, source_system_id,
  schedule_expression, interaction_pattern,
  via
) VALUES (
  'Employee Hire to Activate — OneHR to S/4HANA', 'EMPACT001', 'RICEF-0011',
  'active', 'point_to_point',
  'Human Resources',
  'CPI polls OneHR every 30 minutes for new hires and employment changes. Before writing to S/4, CPI calls the MDG Mapping API to resolve the cross-system cost centre code (OneHR uses a different cost centre numbering scheme). The resolved employee record is then written to S/4 HR infotype 0000/0001.',
  grp_hr, 1,
  'component_scheduled', cpi_prd, '6c3e3b91-9219-4121-9a3b-c0ac49ef5b02',
  'Every 30 minutes', 'scheduled',
  '[]'
) RETURNING id INTO if_emp_hire_pay;

-- Receiver has an api_call hop to MDG before reaching S/4
INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (
  if_emp_hire_pay,
  'ea7e3874-c359-4185-b5b2-4395890bf273',
  'RFC', 'Basic', 's4-rfc-hr',
  jsonb_build_array(
    jsonb_build_object(
      'type','api_call',
      'label','Resolve Cost Centre Code',
      'system_id','cf4faa5b-ceb4-4493-af2a-598fdaefcd10',
      'system_label','LegacyDB'
    ),
    jsonb_build_object(
      'type','component',
      'component_id',mdg_api,
      'label','MDG Mapping API'
    )
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLEX #2 — Purchase Order Broadcast
-- S/4 pushes PO to multiple receivers via different paths
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  logical_group_id, sequence_in_group,
  trigger_type, trigger_system_id, interaction_pattern,
  via
) VALUES (
  'Purchase Order Broadcast — S/4 to Suppliers', 'POBRDC001', 'RICEF-0022',
  'active', 'broadcast',
  'Procure to Pay',
  'S/4HANA pushes approved purchase orders to two channels simultaneously. Ariba Network receives via CPI direct HTTP. Supplier Portal receives via CPI → SFTP Gateway, then MuleSoft picks up from SFTP and delivers to the supplier portal REST API. The SFTP leg allows suppliers who cannot accept real-time HTTP to batch-collect orders.',
  NULL, NULL,
  'system_push', 'ea7e3874-c359-4185-b5b2-4395890bf273', 'async',
  jsonb_build_array(
    jsonb_build_object('type','component','component_id',cpi_prd,'label','SAP CPI')
  )
) RETURNING id INTO if_po_broadcast;

-- Receiver A: Ariba Network — direct from CPI (no extra hops)
INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (if_po_broadcast, 'e289cd7c-955b-47e6-a23f-4e57267c5a38', 'HTTP', 'OAuth2', 'ariba-cpi-oauth', '[]');

-- Receiver B: Supplier Portal — CPI → SFTP → MuleSoft → Supplier Portal
INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (
  if_po_broadcast,
  '59dd5044-b525-404e-a694-ff9b708b73e7',
  'HTTP', 'APIKey', 'supplier-portal-key',
  jsonb_build_array(
    jsonb_build_object('type','component','component_id',sftp_gw,'label','SFTP Gateway'),
    jsonb_build_object('type','component','component_id',mulesoft,'label','MuleSoft EU Runtime')
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Service Now Incident Alert — Event driven via BTP Event Mesh
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  trigger_type, trigger_component_id, source_system_id,
  interaction_pattern,
  via
) VALUES (
  'S/4 System Alert to ServiceNow Incident', 'S4ALERT01', 'RICEF-0033',
  'active', 'point_to_point',
  'IT Operations',
  'S/4HANA publishes system alert events to BTP Event Mesh. CPI subscribes and transforms the alert payload into a ServiceNow incident record. Pattern: fire-and-forget. SLA: incident created within 2 minutes of alert.',
  'component_event', event_bus, 'ea7e3874-c359-4185-b5b2-4395890bf273',
  'event',
  jsonb_build_array(
    jsonb_build_object('type','component','component_id',cpi_prd,'label','SAP CPI')
  )
) RETURNING id INTO if_sn_event;

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (if_sn_event, 'a3ebac3c-1588-4f87-b3e5-69fbe08953ad', 'HTTP', 'OAuth2', 'snow-oauth', '[]');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Purchase Order Status API — Published API (no diagram)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  trigger_type, interaction_pattern,
  api_spec_url, api_auth_scheme, api_description,
  via
) VALUES (
  'Purchase Order Status API', 'POSTAPI01', 'RICEF-0055',
  'active', 'published_api',
  'Procure to Pay',
  'REST API exposing real-time PO status from S/4HANA to any registered consumer. Consumers poll or subscribe via webhook. Authentication via OAuth2 client credentials. Rate limit: 100 req/min per client.',
  'api_inbound', 'sync',
  'https://api.company.com/po-status/v1/openapi.json', 'OAuth2',
  'Exposes PO header and item status, GR/IR postings, and delivery confirmations. Backed by S/4HANA OData service MM_PO_STATUS_SRV.',
  '[]'
) RETURNING id INTO if_po_api;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Workday to S/4 Org Structure Sync
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO interfaces_v2 (
  name, ref, build_ref, status, interface_type,
  functional_domain, description,
  logical_group_id, sequence_in_group,
  trigger_type, trigger_component_id, source_system_id,
  schedule_expression, interaction_pattern,
  via
) VALUES (
  'Org Structure Sync — Workday to S/4HANA', 'ORGSYNC01', 'RICEF-0012',
  'test', 'point_to_point',
  'Human Resources',
  'Nightly full extract of Workday organisational hierarchy. CPI transforms Workday supervisory organisations into S/4 cost centres and organisational units. Currently in UAT — go-live planned after HR cutover.',
  grp_hr, 2,
  'component_scheduled', cpi_prd, '7eac2147-76b2-4757-b8a0-50380ece8d97',
  'Nightly 00:30 UTC', 'scheduled',
  '[]'
) RETURNING id INTO if_workday_org;

INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
VALUES (if_workday_org, 'ea7e3874-c359-4185-b5b2-4395890bf273', 'HTTP', 'OAuth2', 's4-cpi-oauth', '[]');

RAISE NOTICE 'Registry V2 demo seed complete.';
RAISE NOTICE 'Components: %, %, %, %, %', cpi_prd, sftp_gw, mulesoft, event_bus, mdg_api;
RAISE NOTICE 'Interfaces: 10 created across 4 functional domains.';

END $$;
