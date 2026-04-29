-- Clear persisted auto cert so it regenerates on next boot with updated SANs
-- (adding host.docker.internal for Cloud Connector connectivity)
DELETE FROM mock_server_config WHERE key IN ('auto_cert_pem', 'auto_key_pem');
