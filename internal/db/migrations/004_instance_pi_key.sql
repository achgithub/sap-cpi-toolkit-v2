-- PI (Process Integration) service key — used for sending messages to iFlow HTTP adapters.
-- Separate from the API key which is used for management APIs (monitoring, deployment).
-- Empty string = PI key not configured; tools that need it will show a prompt.
ALTER TABLE instances ADD COLUMN IF NOT EXISTS pi_url              TEXT NOT NULL DEFAULT '';
ALTER TABLE instances ADD COLUMN IF NOT EXISTS pi_token_url        TEXT NOT NULL DEFAULT '';
ALTER TABLE instances ADD COLUMN IF NOT EXISTS pi_client_id        TEXT NOT NULL DEFAULT '';
ALTER TABLE instances ADD COLUMN IF NOT EXISTS pi_client_secret_enc TEXT NOT NULL DEFAULT '';
