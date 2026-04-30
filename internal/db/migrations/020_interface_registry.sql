CREATE TABLE systems (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    system_type TEXT        NOT NULL DEFAULT 'external',
    pos_x       DOUBLE PRECISION NOT NULL DEFAULT 0,
    pos_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_systems_project ON systems (project_id);

CREATE TABLE interfaces (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id             UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                   TEXT        NOT NULL,
    description            TEXT        NOT NULL DEFAULT '',
    -- diagram-bound
    interface_type         TEXT        NOT NULL DEFAULT 'point_to_point',
    status                 TEXT        NOT NULL DEFAULT 'design',
    sender_system_id       UUID        REFERENCES systems(id) ON DELETE SET NULL,
    -- registry-bound
    cpi_package_id         TEXT        NOT NULL DEFAULT '',
    cpi_iflow_id           TEXT        NOT NULL DEFAULT '',
    transport              TEXT        NOT NULL DEFAULT '',
    auth_type              TEXT        NOT NULL DEFAULT '',
    firewall_zone          TEXT        NOT NULL DEFAULT '',
    credential_alias       TEXT        NOT NULL DEFAULT '',
    -- debug trigger
    debug_trigger_enabled  BOOLEAN     NOT NULL DEFAULT false,
    debug_trigger_method   TEXT        NOT NULL DEFAULT 'POST',
    debug_trigger_path     TEXT        NOT NULL DEFAULT '',
    debug_trigger_payload  TEXT        NOT NULL DEFAULT '',
    -- unbound
    meta                   JSONB       NOT NULL DEFAULT '{}',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interfaces_project ON interfaces (project_id);

CREATE TABLE interface_receivers (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    interface_id     UUID        NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
    system_id        UUID        REFERENCES systems(id) ON DELETE SET NULL,
    -- per-leg config (broadcast)
    cpi_iflow_id     TEXT        NOT NULL DEFAULT '',
    transport        TEXT        NOT NULL DEFAULT '',
    auth_type        TEXT        NOT NULL DEFAULT '',
    firewall_zone    TEXT        NOT NULL DEFAULT '',
    credential_alias TEXT        NOT NULL DEFAULT '',
    meta             JSONB       NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ir_interface ON interface_receivers (interface_id);
