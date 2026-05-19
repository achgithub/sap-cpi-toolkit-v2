-- Architecture views now store canvas node positions alongside the filter.
-- This lets a view be a complete snapshot: which systems to show + where they sit.

ALTER TABLE architecture_views
  ADD COLUMN positions JSONB NOT NULL DEFAULT '{}';
