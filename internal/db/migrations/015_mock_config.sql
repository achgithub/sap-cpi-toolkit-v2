CREATE TABLE IF NOT EXISTS mock_server_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
-- cert_mode: 'auto' | 'custom'
-- custom_cert_pem: PEM-encoded certificate chain
-- custom_key_pem:  PEM-encoded private key (stored encrypted by application layer)
