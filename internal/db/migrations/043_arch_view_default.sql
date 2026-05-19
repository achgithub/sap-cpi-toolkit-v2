-- Allow one architecture view to be marked as the default.
-- When the Architecture tab opens, the default view's filter is applied automatically.
-- Only one view can be default at a time (enforced by a partial unique index).

ALTER TABLE architecture_views ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX architecture_views_one_default
  ON architecture_views (is_default)
  WHERE is_default = TRUE;
