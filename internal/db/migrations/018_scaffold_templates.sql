CREATE TABLE IF NOT EXISTS scaffold_templates (
    key         TEXT        PRIMARY KEY,
    description TEXT        NOT NULL DEFAULT '',
    content     TEXT        NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
