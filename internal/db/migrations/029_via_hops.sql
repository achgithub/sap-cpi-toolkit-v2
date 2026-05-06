-- Replace integration_platform with structured via hop lists.
-- via on interfaces = hops shared by all receivers (e.g. CPI, SFTP)
-- via on interface_receivers = per-leg hops before the receiver (e.g. MuleSoft)

ALTER TABLE interfaces      DROP COLUMN IF EXISTS integration_platform;
ALTER TABLE interfaces      ADD  COLUMN via JSONB NOT NULL DEFAULT '[]';
ALTER TABLE interface_receivers ADD COLUMN via JSONB NOT NULL DEFAULT '[]';
