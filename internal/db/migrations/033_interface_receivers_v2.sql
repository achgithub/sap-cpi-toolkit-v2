-- Receivers for interfaces_v2. One row per receiver leg.
-- Via hops here are typed and support both component and api_call steps.

CREATE TABLE interface_receivers_v2 (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    interface_id     UUID        NOT NULL REFERENCES interfaces_v2(id) ON DELETE CASCADE,
    system_id        UUID        REFERENCES systems(id) ON DELETE SET NULL,
    transport        TEXT        NOT NULL DEFAULT '',
    auth_type        TEXT        NOT NULL DEFAULT '',
    credential_alias TEXT        NOT NULL DEFAULT '',

    -- Per-receiver hops between the last shared hop and this receiver.
    -- Two hop types:
    --   component: {type:"component", component_id, label}
    --   api_call:  {type:"api_call",  label, system_id, system_label}
    -- api_call hops are invisible in architecture + group diagrams; shown in detailed flow only.
    via              JSONB       NOT NULL DEFAULT '[]',

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON interface_receivers_v2 (interface_id);
CREATE INDEX ON interface_receivers_v2 (system_id);
