ALTER TABLE interfaces
  ADD COLUMN middleware_chain JSONB NOT NULL DEFAULT '[]';

CREATE TABLE interface_dependencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL,
  interface_id  UUID NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'chains_to',
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interface_id, depends_on_id)
);
CREATE INDEX ON interface_dependencies (interface_id);
CREATE INDEX ON interface_dependencies (depends_on_id);
