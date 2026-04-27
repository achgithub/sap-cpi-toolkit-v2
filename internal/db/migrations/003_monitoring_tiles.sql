CREATE TABLE IF NOT EXISTS monitoring_tiles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    instance_id UUID        NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    time_range  TEXT        NOT NULL DEFAULT 'Past Hour',
    status      TEXT        NOT NULL DEFAULT '',
    package_id  TEXT        NOT NULL DEFAULT '',
    iflow_id    TEXT        NOT NULL DEFAULT '',
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_tiles_instance ON monitoring_tiles(instance_id);
