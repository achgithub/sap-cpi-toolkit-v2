-- Custom field extension — organisation-defined attributes on interfaces and receivers.
-- Definitions are global (no project scope). Adding a definition row makes the field
-- immediately available across all interfaces without any schema change.

CREATE TABLE interface_field_definitions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- applies_to: interface | receiver | both
    applies_to    TEXT        NOT NULL DEFAULT 'interface',
    field_key     TEXT        NOT NULL,
    label         TEXT        NOT NULL,
    -- data_type: text | number | date | boolean | select | url
    data_type     TEXT        NOT NULL DEFAULT 'text',
    -- options: populated for select type only e.g. ["Low","Medium","High"]
    options       JSONB       NOT NULL DEFAULT '[]',
    required      BOOLEAN     NOT NULL DEFAULT false,
    display_order INT         NOT NULL DEFAULT 0,
    description   TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (field_key, applies_to)
);

-- Values at the interface (sender) level
CREATE TABLE interface_field_values (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    interface_id  UUID        NOT NULL REFERENCES interfaces_v2(id) ON DELETE CASCADE,
    definition_id UUID        NOT NULL REFERENCES interface_field_definitions(id) ON DELETE CASCADE,
    value         TEXT        NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (interface_id, definition_id)
);

CREATE INDEX ON interface_field_values (interface_id);

-- Values at the receiver level
CREATE TABLE receiver_field_values (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    receiver_id   UUID        NOT NULL REFERENCES interface_receivers_v2(id) ON DELETE CASCADE,
    definition_id UUID        NOT NULL REFERENCES interface_field_definitions(id) ON DELETE CASCADE,
    value         TEXT        NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (receiver_id, definition_id)
);

CREATE INDEX ON receiver_field_values (receiver_id);
