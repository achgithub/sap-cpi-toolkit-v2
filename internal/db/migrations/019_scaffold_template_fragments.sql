CREATE TABLE scaffold_template_fragments (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fragment_key        TEXT        NOT NULL,
    project_id          UUID        REFERENCES projects(id) ON DELETE CASCADE,
    variant_name        TEXT        NOT NULL DEFAULT 'Default',
    description         TEXT        NOT NULL DEFAULT '',
    content             TEXT        NOT NULL DEFAULT '',
    is_default          BOOLEAN     NOT NULL DEFAULT false,
    cpi_adapter_type    TEXT,
    cpi_adapter_version TEXT,
    cpi_component_ns    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One variant_name per (fragment_key) globally
CREATE UNIQUE INDEX uq_stf_global_variant
    ON scaffold_template_fragments (fragment_key, variant_name)
    WHERE project_id IS NULL;

-- One variant_name per (fragment_key, project)
CREATE UNIQUE INDEX uq_stf_project_variant
    ON scaffold_template_fragments (fragment_key, project_id, variant_name)
    WHERE project_id IS NOT NULL;

-- One is_default per fragment_key globally
CREATE UNIQUE INDEX uq_stf_global_default
    ON scaffold_template_fragments (fragment_key)
    WHERE project_id IS NULL AND is_default = true;

-- One is_default per (fragment_key, project)
CREATE UNIQUE INDEX uq_stf_project_default
    ON scaffold_template_fragments (fragment_key, project_id)
    WHERE project_id IS NOT NULL AND is_default = true;

CREATE INDEX idx_stf_project_id   ON scaffold_template_fragments (project_id);
CREATE INDEX idx_stf_fragment_key ON scaffold_template_fragments (fragment_key);

-- Migrate existing 13 rows from scaffold_templates as global defaults
INSERT INTO scaffold_template_fragments
    (fragment_key, project_id, variant_name, description, content, is_default, updated_at)
SELECT key, NULL, 'Default', description, content, true, updated_at
FROM scaffold_templates
ON CONFLICT DO NOTHING;
