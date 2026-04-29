CREATE TABLE IF NOT EXISTS test_packs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID        REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    created_by  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_cases (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id                 UUID        NOT NULL REFERENCES test_packs(id) ON DELETE CASCADE,
    seq                     INT         NOT NULL DEFAULT 0,
    name                    TEXT        NOT NULL,
    method                  TEXT        NOT NULL DEFAULT 'GET',
    url                     TEXT        NOT NULL DEFAULT '',
    headers                 JSONB       NOT NULL DEFAULT '{}',
    body                    TEXT        NOT NULL DEFAULT '',
    expected_status         INT,
    expected_body_contains  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS test_cases_pack_id_seq ON test_cases(pack_id, seq);
