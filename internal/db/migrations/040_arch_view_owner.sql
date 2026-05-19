-- Add owner to architecture_views. Free-text for now; replace with user_id FK when auth is wired.
ALTER TABLE architecture_views ADD COLUMN owner TEXT NOT NULL DEFAULT '';
