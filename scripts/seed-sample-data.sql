-- Sample data seed: S/4HANA ↔ Salesforce CRM (12 interfaces) + S/4 ↔ Workday HCM (3 interfaces)
-- All routed via SAP Cloud Integration (represented as a system node).
-- Idempotent: skips entirely if 'SAP S/4HANA Production' already exists.

DO $$
DECLARE
  v_s4   UUID;
  v_cis  UUID;
  v_sf   UUID;
  v_wd   UUID;
  v_wms  UUID;
  v_grp_sf UUID;
  v_grp_wd UUID;
BEGIN

  IF EXISTS (SELECT 1 FROM systems WHERE name = 'SAP S/4HANA Production') THEN
    RAISE NOTICE 'Sample data already seeded — skipping.';
    RETURN;
  END IF;

  -- ── Systems ───────────────────────────────────────────────────────────────

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('SAP S/4HANA Production', 'SAP S/4HANA', 'On-Prem', 'EU-Central', 'internal', 100, 120)
  RETURNING id INTO v_s4;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('SAP Cloud Integration', 'SAP BTP', 'SAP BTP', 'EU-10', 'internal', 400, 120)
  RETURNING id INTO v_cis;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('Salesforce CRM', 'Salesforce', 'AWS', 'EU-West', 'external', 700, 120)
  RETURNING id INTO v_sf;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('Workday HCM', 'Workday', 'AWS', 'EU-West', 'external', 700, 380)
  RETURNING id INTO v_wd;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('Warehouse Management', 'Custom', 'On-Prem', 'EU-Central', 'internal', 400, 380)
  RETURNING id INTO v_wms;

  -- ── Logical Groups ────────────────────────────────────────────────────────

  INSERT INTO logical_groups (name, description)
  VALUES ('S/4 ↔ Salesforce CRM', 'Order-to-cash and customer master flows between S/4HANA and Salesforce via SAP Cloud Integration')
  RETURNING id INTO v_grp_sf;

  INSERT INTO logical_groups (name, description)
  VALUES ('S/4 ↔ Workday HCM', 'HR master data and payroll flows between S/4HANA and Workday via SAP Cloud Integration')
  RETURNING id INTO v_grp_wd;

  -- ── S/4 ↔ Salesforce — 12 interfaces ─────────────────────────────────────

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Customer Master → Salesforce Account', 'IF-S4-SF-01', 'live', 'point_to_point', v_s4, v_grp_sf, 1, 'Customer Management',
      'Replicates S/4 customer master to Salesforce Account on create/change. Triggered by IDOC DEBMAS.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Sales Order Confirmation → Salesforce', 'IF-S4-SF-02', 'live', 'point_to_point', v_s4, v_grp_sf, 2, 'Order Management',
      'Pushes confirmed sales order number and line details to the linked Salesforce Opportunity.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Material Catalog → Salesforce Product', 'IF-S4-SF-03', 'live', 'point_to_point', v_s4, v_grp_sf, 3, 'Product Management',
      'Replicates saleable materials from S/4 to Salesforce Product2 including UoM and plant data.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Pricing Conditions → Salesforce Pricebook', 'IF-S4-SF-04', 'live', 'point_to_point', v_s4, v_grp_sf, 4, 'Pricing',
      'Publishes active S/4 pricing condition records to Salesforce Pricebook2 entries for quoting.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Delivery Status → Salesforce', 'IF-S4-SF-05', 'live', 'point_to_point', v_s4, v_grp_sf, 5, 'Logistics',
      'Sends outbound delivery and shipment tracking updates to Salesforce Opportunity/Order.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Invoice Posted → Salesforce', 'IF-S4-SF-06', 'live', 'point_to_point', v_s4, v_grp_sf, 6, 'Finance',
      'Notifies Salesforce when a customer invoice is posted so the opportunity stage is closed-won.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Credit Limit Check ← Salesforce', 'IF-SF-S4-01', 'live', 'point_to_point', v_sf, v_grp_sf, 7, 'Finance',
      'Salesforce calls S/4 synchronously to retrieve available credit limit before a quote is issued.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_s4, 'HTTPS', 'BasicAuth' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Quote Accepted → Sales Order', 'IF-SF-S4-02', 'test', 'point_to_point', v_sf, v_grp_sf, 8, 'Order Management',
      'Creates a sales order in S/4 when a Salesforce CPQ quote is accepted by the customer.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_s4, 'HTTPS', 'BasicAuth' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Contract Replication → Salesforce', 'IF-S4-SF-07', 'test', 'point_to_point', v_s4, v_grp_sf, 9, 'Contract Management',
      'Replicates S/4 sales contracts to the Salesforce Contract object for customer portal visibility.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Payment Terms → Salesforce Account', 'IF-S4-SF-08', 'test', 'point_to_point', v_s4, v_grp_sf, 10, 'Finance',
      'Syncs customer payment term codes from S/4 to Salesforce Account for display in CPQ quotes.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Returns & Credit Memo → Salesforce Case', 'IF-S4-SF-09', 'design', 'point_to_point', v_s4, v_grp_sf, 11, 'Order Management',
      'Raises a Salesforce Case when a return order or credit memo is created in S/4.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_sf, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Opportunity Close → Revenue Recognition', 'IF-SF-S4-03', 'design', 'point_to_point', v_sf, v_grp_sf, 12, 'Finance',
      'Sends closed-won opportunity data from Salesforce to S/4 to initiate revenue recognition posting.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_s4, 'HTTPS', 'BasicAuth' FROM iface;

  -- ── S/4 ↔ Workday — 3 interfaces ─────────────────────────────────────────

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Employee Master → S/4 HR Mini-Master', 'IF-WD-S4-01', 'live', 'point_to_point', v_wd, v_grp_wd, 1, 'HR',
      'Replicates Workday employee master records to S/4 for cost centre assignment and payroll posting.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_s4, 'HTTPS', 'BasicAuth' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Cost Centre Structure → Workday', 'IF-S4-WD-01', 'live', 'point_to_point', v_s4, v_grp_wd, 2, 'Finance',
      'Sends S/4 cost centre hierarchy to Workday for use in expense reports and headcount allocation.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_wd, 'HTTPS', 'OAuth2' FROM iface;

  WITH iface AS (
    INSERT INTO interfaces (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
    VALUES ('Payroll Journal → S/4 FI Posting', 'IF-WD-S4-02', 'test', 'point_to_point', v_wd, v_grp_wd, 3, 'Finance',
      'Posts Workday payroll run results as journal entries in S/4 General Ledger after approval.',
      jsonb_build_array(jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)))
    RETURNING id)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type) SELECT id, v_s4, 'HTTPS', 'BasicAuth' FROM iface;

  RAISE NOTICE 'Sample data seeded: 5 systems, 2 groups, 15 interfaces.';
END $$;
