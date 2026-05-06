CREATE TABLE interface_canvas_elements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interface_id UUID NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  system_id    UUID REFERENCES systems(id) ON DELETE SET NULL,
  label        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  pos_x        FLOAT NOT NULL DEFAULT 0,
  pos_y        FLOAT NOT NULL DEFAULT 0,
  width        FLOAT NOT NULL DEFAULT 180,
  height       FLOAT NOT NULL DEFAULT 80,
  color        TEXT NOT NULL DEFAULT '',
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON interface_canvas_elements (interface_id);
