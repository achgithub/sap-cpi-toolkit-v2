-- Foundation schema: projects, sub-projects, instances, artifacts, roles

CREATE TABLE IF NOT EXISTS projects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sub_projects (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    type           TEXT        NOT NULL CHECK (type IN ('interface', 'library')),
    cpi_package_id TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- client_secret is stored encrypted (AES-GCM, key from ENC_KEY env var).
-- rate_* columns are calls/min limits per API category; NULL = use process default.
CREATE TABLE IF NOT EXISTS instances (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name               TEXT        NOT NULL,
    url                TEXT        NOT NULL,
    client_id          TEXT        NOT NULL,
    client_secret_enc  TEXT        NOT NULL,
    system_type        TEXT        NOT NULL CHECK (system_type IN ('DEV', 'QA', 'PRD', 'SBX', 'TRL')),
    rate_monitoring    INTEGER     CHECK (rate_monitoring > 0),
    rate_operations    INTEGER     CHECK (rate_operations > 0),
    rate_read          INTEGER     CHECK (rate_read > 0),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artifacts (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_project_id UUID        NOT NULL REFERENCES sub_projects(id) ON DELETE CASCADE,
    type           TEXT        NOT NULL,
    name           TEXT        NOT NULL,
    version        INTEGER     NOT NULL DEFAULT 1,
    storage_ref    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    TEXT        NOT NULL,
    role       TEXT        NOT NULL CHECK (role IN ('admin', 'developer', 'tester', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, user_id)
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_sub_projects_project_id  ON sub_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_instances_project_id     ON instances(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_sub_project_id ON artifacts(sub_project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id  ON project_members(user_id);
