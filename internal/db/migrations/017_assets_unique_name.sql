-- Remove duplicates keeping the most recently updated row per (name, type, project scope)
DELETE FROM assets
WHERE id NOT IN (
    SELECT DISTINCT ON (lower(name), type, COALESCE(project_id::text, ''))
        id
    FROM assets
    ORDER BY lower(name), type, COALESCE(project_id::text, ''), updated_at DESC
);

-- Unique index: name (case-insensitive) + type + project scope (null treated as global)
CREATE UNIQUE INDEX IF NOT EXISTS assets_unique_name_type_scope
    ON assets (lower(name), type, COALESCE(project_id::text, ''));
