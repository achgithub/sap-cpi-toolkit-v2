-- Flow diagram canvas state (freeform, saved per interface or logical group)
ALTER TABLE interfaces     ADD COLUMN IF NOT EXISTS flow_diagram_state JSONB;
ALTER TABLE logical_groups ADD COLUMN IF NOT EXISTS flow_diagram_state JSONB;
