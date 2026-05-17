-- Routing scenario seed: exercises all interface routing combinations
--
-- Patterns covered:
--   1. Direct (no middleware) — S4 → External Tax Service
--   2. Chained middleware    — S4 → PI/PO → CPI → Supplier (legacy double-hop)
--   3. Single platform       — S4 → CPI → Supplier (modern replacement for #2)
--   4. Broadcast, uniform    — S4 → CPI → WMS-EU, WMS-APAC, Ariba (3 receivers, no extra hops)
--   5. Broadcast, mixed vias — S4 → CPI → [Supplier direct] + [Ariba via SFTP Gateway]
--   6. Inbound via legacy PO — Supplier → PI/PO → S4
--   7. Direct inbound sync   — Ariba → S4 (no middleware)
--
-- Idempotent: skips if 'SAP Process Orchestration' already exists.

DO $$
DECLARE
  -- Existing systems (looked up by name — must be seeded first)
  v_s4    UUID;
  v_cis   UUID;
  v_wms   UUID;
  -- New systems
  v_po    UUID;   -- SAP Process Orchestration (PI/PO)
  v_sftp  UUID;   -- SFTP File Gateway
  v_tax   UUID;   -- External Tax Service
  v_sup   UUID;   -- Supplier Portal
  v_arb   UUID;   -- Ariba Network
  v_wms2  UUID;   -- WMS APAC
  -- Working
  v_grp   UUID;
  v_iface UUID;
BEGIN

  IF EXISTS (SELECT 1 FROM systems WHERE name = 'SAP Process Orchestration') THEN
    RAISE NOTICE 'Routing scenario data already seeded — skipping.';
    RETURN;
  END IF;

  -- Look up existing systems (created by seed-sample-data.sql)
  SELECT id INTO v_s4  FROM systems WHERE name = 'SAP S/4HANA Production';
  SELECT id INTO v_cis FROM systems WHERE name = 'SAP Cloud Integration';
  SELECT id INTO v_wms FROM systems WHERE name = 'Warehouse Management';

  IF v_s4 IS NULL THEN
    RAISE EXCEPTION 'Base systems not found — run seed-sample-data.sql first.';
  END IF;

  -- ── New systems ────────────────────────────────────────────────────────────

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('SAP Process Orchestration', 'SAP PI/PO', 'On-Prem', 'EU-Central', 'internal', 250, 600)
  RETURNING id INTO v_po;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('SFTP File Gateway', 'Custom', 'On-Prem', 'EU-Central', 'internal', 550, 700)
  RETURNING id INTO v_sftp;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('External Tax Service', 'External', 'Cloud', 'EU-West', 'external', 900, 600)
  RETURNING id INTO v_tax;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('Supplier Portal', 'External', 'AWS', 'EU-West', 'external', 900, 400)
  RETURNING id INTO v_sup;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('Ariba Network', 'SAP Ariba', 'SAP BTP', 'EU-10', 'external', 900, 200)
  RETURNING id INTO v_arb;

  INSERT INTO systems (name, system_type, infra_type, infra_region, owner_type, pos_x, pos_y)
  VALUES ('WMS APAC', 'Custom', 'On-Prem', 'APAC', 'internal', 700, 700)
  RETURNING id INTO v_wms2;

  -- ── Logical group ──────────────────────────────────────────────────────────

  INSERT INTO logical_groups (name, description)
  VALUES ('Mixed Routing Scenarios',
          'Exercises all interface routing patterns: direct, chained middleware, broadcast, and receiver-specific hops')
  RETURNING id INTO v_grp;

  -- ── 1. Direct (no middleware) ──────────────────────────────────────────────
  -- S4 → External Tax Service synchronously. via = [].
  -- On the diagram: single arc S4 → Tax, labeled IF-S4-TAX-01.

  INSERT INTO interfaces
    (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
  VALUES
    ('Tax Code Validation — Direct API', 'IF-S4-TAX-01', 'active', 'point_to_point',
     v_s4, v_grp, 1, 'Finance',
     'S/4 calls External Tax Service synchronously at billing to validate tax codes. No middleware — direct HTTPS.',
     '[]'::jsonb)
  RETURNING id INTO v_iface;

  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type)
  VALUES (v_iface, v_tax, 'HTTPS', 'APIKey');

  -- ── 2. Legacy double-hop: S4 → PI/PO → CPI → Supplier ────────────────────
  -- Two platforms in via[]. Each arc between nodes carries the same ref.
  -- On the diagram: S4→PO arc, PO→CPI arc, CPI→Supplier arc — all labeled IF-S4-SUP-01.

  INSERT INTO interfaces
    (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
  VALUES
    ('Purchase Order → Supplier (Legacy Chain)', 'IF-S4-SUP-01', 'deprecated', 'point_to_point',
     v_s4, v_grp, 2, 'Procurement',
     'PO routes via legacy PI/PO then CPI before reaching Supplier Portal. Superseded by IF-S4-SUP-02.',
     jsonb_build_array(
       jsonb_build_object('label', 'SAP Process Orchestration', 'system_id', v_po::text),
       jsonb_build_object('label', 'SAP Cloud Integration',     'system_id', v_cis::text)
     ))
  RETURNING id INTO v_iface;

  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type)
  VALUES (v_iface, v_sup, 'HTTPS', 'OAuth2');

  -- ── 3. Single platform: S4 → CPI → Supplier (replacement) ────────────────
  -- Design phase — cutover pending.
  -- On the diagram: S4→CPI arc, CPI→Supplier arc — both labeled IF-S4-SUP-02.

  INSERT INTO interfaces
    (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
  VALUES
    ('Purchase Order → Supplier (Direct CPI)', 'IF-S4-SUP-02', 'design', 'point_to_point',
     v_s4, v_grp, 3, 'Procurement',
     'New route bypassing legacy PI/PO: S/4 → CPI → Supplier Portal directly. Pending cutover from IF-S4-SUP-01.',
     jsonb_build_array(
       jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)
     ))
  RETURNING id INTO v_iface;

  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type)
  VALUES (v_iface, v_sup, 'HTTPS', 'OAuth2');

  -- ── 4. Broadcast, uniform receivers (3 receivers, no extra hops) ──────────
  -- S4 publishes stock levels via CPI to WMS-EU, WMS-APAC, and Ariba.
  -- On the diagram: S4→CPI arc labeled IF-S4-INV-01, then CPI→WMS arc,
  -- CPI→WMS-APAC arc, CPI→Ariba arc — all labeled IF-S4-INV-01.

  INSERT INTO interfaces
    (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
  VALUES
    ('Inventory Level Update — Broadcast', 'IF-S4-INV-01', 'active', 'broadcast',
     v_s4, v_grp, 4, 'Logistics',
     'Material stock levels published via CPI to WMS EU, WMS APAC, and Ariba Network for ATP checks.',
     jsonb_build_array(
       jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)
     ))
  RETURNING id INTO v_iface;

  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type)
  VALUES
    (v_iface, v_wms,  'HTTPS', 'OAuth2'),
    (v_iface, v_wms2, 'HTTPS', 'OAuth2'),
    (v_iface, v_arb,  'HTTPS', 'OAuth2');

  -- ── 5. Broadcast with mixed receiver vias ─────────────────────────────────
  -- S4 → CPI → Supplier Portal (direct from CPI)
  --           → Ariba Network  (via SFTP File Gateway — legacy partner agreement)
  -- On the diagram:
  --   S4→CPI arc (IF-S4-PAY-01), CPI→Supplier arc (IF-S4-PAY-01),
  --   CPI→SFTP arc (IF-S4-PAY-01), SFTP→Ariba arc (IF-S4-PAY-01).
  -- Receiver via on the Ariba leg adds an extra hop unique to that receiver.

  INSERT INTO interfaces
    (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
  VALUES
    ('Payment Advice — Mixed Delivery', 'IF-S4-PAY-01', 'active', 'broadcast',
     v_s4, v_grp, 5, 'Finance',
     'Payment advice from S/4 via CPI. Modern Supplier gets direct API call; Ariba drops file via SFTP Gateway (legacy commercial agreement).',
     jsonb_build_array(
       jsonb_build_object('label', 'SAP Cloud Integration', 'system_id', v_cis::text)
     ))
  RETURNING id INTO v_iface;

  -- Receiver 1: Supplier Portal — no extra hops (direct from CPI)
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type, via)
  VALUES (v_iface, v_sup, 'HTTPS', 'OAuth2', '[]'::jsonb);

  -- Receiver 2: Ariba — routes via SFTP File Gateway before delivery
  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type, via)
  VALUES (v_iface, v_arb, 'SFTP', 'SSHKey',
    jsonb_build_array(
      jsonb_build_object('label', 'SFTP File Gateway', 'system_id', v_sftp::text)
    ));

  -- ── 6. Inbound via legacy PI/PO: Supplier → PI/PO → S4 ───────────────────
  -- Supplier pushes EDI order acknowledgement to PI/PO endpoint.
  -- PI/PO maps EDI to IDoc and delivers to S/4 via RFC.
  -- On the diagram: Supplier→PO arc, PO→S4 arc — both labeled IF-SUP-S4-01.

  INSERT INTO interfaces
    (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
  VALUES
    ('Order Acknowledgement ← Supplier (via PI/PO)', 'IF-SUP-S4-01', 'test', 'point_to_point',
     v_sup, v_grp, 6, 'Procurement',
     'Supplier sends EDI X12 855 order acknowledgement to PI/PO. PI/PO transforms to IDoc ORDERS and posts to S/4 via RFC.',
     jsonb_build_array(
       jsonb_build_object('label', 'SAP Process Orchestration', 'system_id', v_po::text)
     ))
  RETURNING id INTO v_iface;

  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type)
  VALUES (v_iface, v_s4, 'RFC', 'BasicAuth');

  -- ── 7. Direct inbound sync: Ariba → S4 ───────────────────────────────────
  -- Ariba calls S/4 OData for ATP stock availability. Direct, no middleware.
  -- On the diagram: single arc Ariba → S4, labeled IF-ARB-S4-01.

  INSERT INTO interfaces
    (name, ref, status, interface_type, sender_system_id, logical_group_id, sequence_in_group, functional_domain, description, via)
  VALUES
    ('ATP Stock Check ← Ariba (Direct Sync)', 'IF-ARB-S4-01', 'active', 'point_to_point',
     v_arb, v_grp, 7, 'Procurement',
     'Ariba calls S/4 OData service synchronously for ATP stock availability before requisition approval. Direct HTTPS, no middleware.',
     '[]'::jsonb)
  RETURNING id INTO v_iface;

  INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type)
  VALUES (v_iface, v_s4, 'HTTPS', 'OAuth2');

  RAISE NOTICE 'Routing scenario data seeded: 6 new systems, 1 group, 7 interfaces.';
END $$;
