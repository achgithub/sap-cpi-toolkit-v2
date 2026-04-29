CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    type             TEXT        NOT NULL DEFAULT 'http',  -- 'http' | 'test_pack'
    interval_seconds INT         NOT NULL DEFAULT 3600,
    config           JSONB       NOT NULL DEFAULT '{}',
    enabled          BOOLEAN     NOT NULL DEFAULT true,
    last_run_at      TIMESTAMPTZ,
    last_status      TEXT,
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
