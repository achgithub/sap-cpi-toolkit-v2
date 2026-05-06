-- dependency_note captures the dependency context for an interface.
-- For shared_library/utility types this must be explicitly acknowledged.
-- Default 'none' means "no external dependencies" — intentional, not undeclared.
ALTER TABLE interfaces ADD COLUMN dependency_note TEXT NOT NULL DEFAULT 'none';
