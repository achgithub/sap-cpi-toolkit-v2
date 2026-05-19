-- Soft-delete support for V1 interfaces and V2 receivers.
-- NULL = active, timestamp = archived.

ALTER TABLE interfaces               ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE interface_receivers_v2   ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX ON interfaces             (archived_at) WHERE archived_at IS NULL;
CREATE INDEX ON interface_receivers_v2 (archived_at) WHERE archived_at IS NULL;
