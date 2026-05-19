-- Named saved views for the Architecture V2 diagram.
-- Stores the filter state (systems, infra, status, strict) as JSONB.
-- No user scoping yet — shared company-wide until auth is fully wired.

CREATE TABLE architecture_views (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL UNIQUE,
  filter     JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
