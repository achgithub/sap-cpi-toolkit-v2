ALTER TABLE interfaces ADD COLUMN interface_ref TEXT NOT NULL DEFAULT '';

-- Enforce uniqueness only for non-empty refs within a project
CREATE UNIQUE INDEX uq_interfaces_ref
    ON interfaces (project_id, interface_ref)
    WHERE interface_ref <> '';
