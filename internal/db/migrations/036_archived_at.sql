-- Soft delete via archived_at. NULL = active, timestamp = archived.
-- List endpoints filter archived_at IS NULL by default.
-- Hard deletion is admin-only via a future admin UI.

ALTER TABLE interfaces_v2          ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE integration_components ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE systems                ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX ON interfaces_v2          (archived_at) WHERE archived_at IS NULL;
CREATE INDEX ON integration_components (archived_at) WHERE archived_at IS NULL;
CREATE INDEX ON systems                (archived_at) WHERE archived_at IS NULL;
