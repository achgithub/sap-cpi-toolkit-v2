CREATE TABLE IF NOT EXISTS assets (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    type            TEXT        NOT NULL DEFAULT '',
    content         TEXT        NOT NULL DEFAULT '',
    project_id      UUID        REFERENCES projects(id)     ON DELETE SET NULL,
    sub_project_id  UUID        REFERENCES sub_projects(id) ON DELETE SET NULL,
    created_by      TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_project_id     ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_sub_project_id ON assets(sub_project_id);
CREATE INDEX IF NOT EXISTS idx_assets_type           ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_updated_at     ON assets(updated_at DESC);
