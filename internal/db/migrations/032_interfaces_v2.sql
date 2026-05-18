-- Interface registry v2 — clean schema with trigger model and interaction patterns.
-- Coexists with the existing interfaces table. No existing tables are modified.

CREATE TABLE interfaces_v2 (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    name                 TEXT        NOT NULL,
    ref                  TEXT        NOT NULL UNIQUE,
    build_ref            TEXT        NOT NULL DEFAULT '',
    status               TEXT        NOT NULL DEFAULT 'design',
    -- interface_type: point_to_point | broadcast | shared_library | utility | published_api
    interface_type       TEXT        NOT NULL DEFAULT 'point_to_point',
    functional_domain    TEXT        NOT NULL DEFAULT '',
    description          TEXT        NOT NULL DEFAULT '',

    -- Grouping
    logical_group_id     UUID        REFERENCES logical_groups(id) ON DELETE SET NULL,
    sequence_in_group    INT,

    -- Trigger — who or what initiates this interface
    -- trigger_type: system_push | component_scheduled | component_event | api_inbound
    trigger_type         TEXT        NOT NULL DEFAULT 'system_push',
    trigger_system_id    UUID        REFERENCES systems(id) ON DELETE SET NULL,
    trigger_component_id UUID        REFERENCES integration_components(id) ON DELETE SET NULL,
    schedule_expression  TEXT,
    -- source_system_id: where data is read from when it differs from the trigger
    -- e.g. CPI (trigger) fetches from SuccessFactors (source)
    source_system_id     UUID        REFERENCES systems(id) ON DELETE SET NULL,

    -- Interaction character
    -- interaction_pattern: sync | async | event | scheduled
    interaction_pattern  TEXT        NOT NULL DEFAULT 'async',

    -- Shared integration path — typed hops, components only
    -- [{type:"component", component_id, label}]
    via                  JSONB       NOT NULL DEFAULT '[]',

    -- Published API extras (only populated when interface_type = published_api)
    api_spec_url         TEXT,
    api_auth_scheme      TEXT,
    api_description      TEXT,

    -- Canvas state for the detailed flow diagram
    flow_diagram_state   JSONB,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON interfaces_v2 (logical_group_id);
CREATE INDEX ON interfaces_v2 (trigger_system_id);
CREATE INDEX ON interfaces_v2 (trigger_component_id);
CREATE INDEX ON interfaces_v2 (source_system_id);
CREATE INDEX ON interfaces_v2 (status);
CREATE INDEX ON interfaces_v2 (interface_type);
CREATE INDEX ON interfaces_v2 (interaction_pattern);
