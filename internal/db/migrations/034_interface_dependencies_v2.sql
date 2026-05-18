-- Dependencies between v2 interfaces — impact analysis and chain mapping.

CREATE TABLE interface_dependencies_v2 (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    interface_id  UUID        NOT NULL REFERENCES interfaces_v2(id) ON DELETE CASCADE,
    depends_on_id UUID        NOT NULL REFERENCES interfaces_v2(id) ON DELETE CASCADE,
    -- kind: chains_to | triggers | shares_data
    kind          TEXT        NOT NULL DEFAULT 'chains_to',
    note          TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (interface_id, depends_on_id)
);

CREATE INDEX ON interface_dependencies_v2 (interface_id);
CREATE INDEX ON interface_dependencies_v2 (depends_on_id);
