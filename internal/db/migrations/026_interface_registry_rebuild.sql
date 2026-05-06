-- Clean rebuild of the interface registry.
-- Drops all tables introduced in migrations 020-025 and replaces them
-- with the company-wide schema (no project scope on systems or interfaces).

DROP TABLE IF EXISTS interface_canvas_elements  CASCADE;
DROP TABLE IF EXISTS interface_dependencies      CASCADE;
DROP TABLE IF EXISTS interface_receivers         CASCADE;
DROP TABLE IF EXISTS interfaces                  CASCADE;
DROP TABLE IF EXISTS systems                     CASCADE;
DROP TABLE IF EXISTS registry_config             CASCADE;

-- ── Systems ───────────────────────────────────────────────────────────────────

CREATE TABLE systems (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT         NOT NULL,
    system_type  TEXT         NOT NULL DEFAULT '',
    infra_type   TEXT         NOT NULL DEFAULT '',
    infra_region TEXT         NOT NULL DEFAULT '',
    description  TEXT         NOT NULL DEFAULT '',
    owner_type   TEXT         NOT NULL DEFAULT 'internal',
    pos_x        DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_y        DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Logical groups ────────────────────────────────────────────────────────────

CREATE TABLE logical_groups (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Interfaces ────────────────────────────────────────────────────────────────

CREATE TABLE interfaces (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT        NOT NULL,
    ref                 CHAR(10)    NOT NULL UNIQUE,
    build_ref           TEXT        NOT NULL DEFAULT '',
    status              TEXT        NOT NULL DEFAULT 'design',
    interface_type      TEXT        NOT NULL DEFAULT 'point_to_point',
    sender_system_id    UUID        REFERENCES systems(id) ON DELETE SET NULL,
    logical_group_id    UUID        REFERENCES logical_groups(id) ON DELETE SET NULL,
    sequence_in_group   INT,
    sender_step_label   TEXT        NOT NULL DEFAULT '',
    receiver_step_label TEXT        NOT NULL DEFAULT '',
    functional_domain   TEXT        NOT NULL DEFAULT '',
    delivery_project_id UUID,
    description         TEXT        NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON interfaces (logical_group_id);
CREATE INDEX ON interfaces (sender_system_id);
CREATE INDEX ON interfaces (delivery_project_id);
CREATE INDEX ON interfaces (status);

-- ── Interface receivers ───────────────────────────────────────────────────────

CREATE TABLE interface_receivers (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    interface_id     UUID        NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
    system_id        UUID        REFERENCES systems(id) ON DELETE SET NULL,
    transport        TEXT        NOT NULL DEFAULT '',
    auth_type        TEXT        NOT NULL DEFAULT '',
    credential_alias TEXT        NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON interface_receivers (interface_id);

-- ── Interface dependencies ────────────────────────────────────────────────────

CREATE TABLE interface_dependencies (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    interface_id  UUID        NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
    depends_on_id UUID        NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
    kind          TEXT        NOT NULL DEFAULT 'chains_to',
    note          TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (interface_id, depends_on_id)
);

-- ── Registry config ───────────────────────────────────────────────────────────

CREATE TABLE registry_config (
    key        TEXT        PRIMARY KEY,
    value      JSONB       NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO registry_config (key, value) VALUES
('system_types', '[
    {"name":"SAP S/4HANA",              "color":"#0070F2"},
    {"name":"SAP ECC",                  "color":"#0070F2"},
    {"name":"SAP BTP",                  "color":"#FF6B35"},
    {"name":"Salesforce",               "color":"#00A1E0"},
    {"name":"Workday",                  "color":"#F5A623"},
    {"name":"Microsoft",                "color":"#00A4EF"},
    {"name":"AWS Service",              "color":"#FF9900"},
    {"name":"External Partner",         "color":"#78909C"},
    {"name":"Custom",                   "color":"#78909C"}
]'::jsonb),
('infra_types', '[
    {"name":"On-Prem",  "category":"on_prem"},
    {"name":"AWS",      "category":"cloud"},
    {"name":"Azure",    "category":"cloud"},
    {"name":"GCP",      "category":"cloud"},
    {"name":"SAP BTP",  "category":"cloud"},
    {"name":"Hybrid",   "category":"hybrid"}
]'::jsonb),
('integration_platforms', '[
    {"name":"SAP Integration Suite"},
    {"name":"MuleSoft"},
    {"name":"Azure Integration Services"},
    {"name":"AWS EventBridge"},
    {"name":"SAP PI/PO"},
    {"name":"None"}
]'::jsonb);
