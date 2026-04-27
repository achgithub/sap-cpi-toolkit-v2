-- token_url is the OAuth token endpoint for the CPI tenant.
-- Stored separately from the API URL because SAP IAS token URLs follow a different pattern.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS token_url TEXT NOT NULL DEFAULT '';
