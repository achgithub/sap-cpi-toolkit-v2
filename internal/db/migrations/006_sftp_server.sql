CREATE TABLE IF NOT EXISTS sftp_server_config (
    id                       TEXT        PRIMARY KEY DEFAULT 'default',
    name                     TEXT        NOT NULL DEFAULT 'SFTP Server',
    auth_mode                TEXT        NOT NULL DEFAULT 'password',
    behavior_mode            TEXT        NOT NULL DEFAULT 'success',
    username                 TEXT        NOT NULL DEFAULT '',
    password_enc             TEXT        NOT NULL DEFAULT '',
    authorized_keys          TEXT        NOT NULL DEFAULT '',
    ssh_host_key             TEXT        NOT NULL DEFAULT '',
    ssh_host_key_fingerprint TEXT        NOT NULL DEFAULT '',
    last_seen                TIMESTAMPTZ,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure a default row always exists.
INSERT INTO sftp_server_config (id) VALUES ('default') ON CONFLICT DO NOTHING;
