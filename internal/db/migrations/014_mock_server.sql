CREATE TABLE IF NOT EXISTS mock_endpoints (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    method           TEXT        NOT NULL DEFAULT '*',
    path_pattern     TEXT        NOT NULL,
    response_status  INT         NOT NULL DEFAULT 200,
    response_headers JSONB       NOT NULL DEFAULT '{}',
    response_body    TEXT        NOT NULL DEFAULT '',
    latency_ms       INT         NOT NULL DEFAULT 0,
    enabled          BOOL        NOT NULL DEFAULT true,
    hit_count        INT         NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mock_requests (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id      UUID        REFERENCES mock_endpoints(id) ON DELETE SET NULL,
    method           TEXT        NOT NULL,
    path             TEXT        NOT NULL,
    request_headers  JSONB       NOT NULL DEFAULT '{}',
    request_body     TEXT        NOT NULL DEFAULT '',
    response_status  INT         NOT NULL DEFAULT 0,
    matched          BOOL        NOT NULL DEFAULT false,
    received_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mock_requests_received ON mock_requests(received_at DESC);
