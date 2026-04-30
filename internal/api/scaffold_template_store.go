package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Descriptions ──────────────────────────────────────────────────────────────

var scaffoldFragmentDescriptions = map[string]string{
	"collaboration_ext":          "iFlow-level properties (logging, session handling, component version)",
	"sender_participant_HTTPS":   "HTTPS sender participant declaration",
	"sender_participant_SFTP":    "SFTP sender participant declaration",
	"receiver_participant_HTTP":  "HTTP receiver participant declaration",
	"receiver_participant_SFTP":  "SFTP receiver participant declaration",
	"sender_messageflow_HTTPS":   "HTTPS sender adapter — inbound channel properties",
	"sender_messageflow_SFTP":    "SFTP sender adapter — polling channel properties",
	"receiver_messageflow_HTTP":  "HTTP receiver adapter — outbound channel properties",
	"receiver_messageflow_SFTP":  "SFTP receiver adapter — deposit channel properties",
	"step_content_modifier":      "Content Modifier — sets SAP_ApplicationID standard header",
	"step_groovy":                "Groovy Script step stub",
	"step_xslt":                  "XSLT Mapping step stub",
	"step_exception_subprocess":  "Exception Subprocess — catches unhandled errors",
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TemplateVariant struct {
	ID          string    `json:"id"`
	FragmentKey string    `json:"fragment_key"`
	ProjectID   *string   `json:"project_id"`
	VariantName string    `json:"variant_name"`
	Description string    `json:"description"`
	Content     string    `json:"content"`
	IsDefault   bool      `json:"is_default"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type FragmentGroup struct {
	FragmentKey string            `json:"fragment_key"`
	Description string            `json:"description"`
	Variants    []TemplateVariant `json:"variants"`
}

// ── Seed ─────────────────────────────────────────────────────────────────────

func SeedScaffoldTemplates(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) {
	inserted := 0
	for key, content := range scaffoldDefaultTemplates {
		var exists bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM scaffold_template_fragments WHERE fragment_key=$1 AND project_id IS NULL)`, key,
		).Scan(&exists); err != nil {
			log.Error("scaffold template seed: check failed", "key", key, "error", err)
			continue
		}
		if exists {
			continue
		}
		desc := scaffoldFragmentDescriptions[key]
		if _, err := pool.Exec(ctx,
			`INSERT INTO scaffold_template_fragments
			    (fragment_key, project_id, variant_name, description, content, is_default)
			 VALUES ($1, NULL, 'Default', $2, $3, true)
			 ON CONFLICT DO NOTHING`,
			key, desc, content,
		); err != nil {
			log.Error("scaffold template seed: insert failed", "key", key, "error", err)
		} else {
			inserted++
		}
	}
	if inserted > 0 {
		log.Info("scaffold templates: seeded new global defaults", "count", inserted)
	}
}

// ── Load (used by scaffold ZIP builder) ──────────────────────────────────────

// LoadScaffoldTemplates returns the global default variant for each fragment key.
func LoadScaffoldTemplates(ctx context.Context, pool *pgxpool.Pool) map[string]string {
	rows, err := pool.Query(ctx,
		`SELECT fragment_key, content FROM scaffold_template_fragments
		 WHERE project_id IS NULL AND is_default = true`)
	if err != nil {
		return scaffoldDefaultTemplates
	}
	defer rows.Close()
	result := make(map[string]string, len(scaffoldDefaultTemplates))
	for rows.Next() {
		var key, content string
		if err := rows.Scan(&key, &content); err == nil {
			result[key] = content
		}
	}
	for k, v := range scaffoldDefaultTemplates {
		if _, ok := result[k]; !ok {
			result[k] = v
		}
	}
	return result
}

// LoadScaffoldTemplatesForProject resolves templates for a specific project.
// variantIDs is an optional map of fragment_key → variant UUID for explicit overrides.
// Resolution order: explicit variant override → project default → global default → hardcoded.
func LoadScaffoldTemplatesForProject(ctx context.Context, pool *pgxpool.Pool, projectID string, variantIDs map[string]string) map[string]string {
	result := make(map[string]string, len(scaffoldDefaultTemplates))

	// 1. Explicit variant overrides
	if len(variantIDs) > 0 {
		ids := make([]string, 0, len(variantIDs))
		for _, id := range variantIDs {
			ids = append(ids, id)
		}
		rows, err := pool.Query(ctx,
			`SELECT fragment_key, content FROM scaffold_template_fragments WHERE id = ANY($1)`,
			ids)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var key, content string
				if rows.Scan(&key, &content) == nil {
					result[key] = content
				}
			}
		}
	}

	// 2. Project default, then global default for remaining keys via DISTINCT ON
	rows, err := pool.Query(ctx,
		`SELECT DISTINCT ON (fragment_key) fragment_key, content
		 FROM scaffold_template_fragments
		 WHERE (project_id = $1 OR project_id IS NULL) AND is_default = true
		 ORDER BY fragment_key, project_id NULLS LAST`,
		projectID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var key, content string
			if rows.Scan(&key, &content) == nil {
				if _, already := result[key]; !already {
					result[key] = content
				}
			}
		}
	}

	// 3. Hardcoded fallback
	for k, v := range scaffoldDefaultTemplates {
		if _, ok := result[k]; !ok {
			result[k] = v
		}
	}
	return result
}

// CopyGlobalTemplatesToProject bulk-copies all global variants into project scope.
// Safe to call multiple times (ON CONFLICT DO NOTHING).
func CopyGlobalTemplatesToProject(ctx context.Context, pool *pgxpool.Pool, projectID string) error {
	_, err := pool.Exec(ctx,
		`INSERT INTO scaffold_template_fragments
		    (fragment_key, project_id, variant_name, description, content, is_default)
		 SELECT fragment_key, $1, variant_name, description, content, is_default
		 FROM scaffold_template_fragments
		 WHERE project_id IS NULL
		 ON CONFLICT DO NOTHING`,
		projectID)
	return err
}

// ── HTTP Handlers ─────────────────────────────────────────────────────────────

func scanVariant(rows interface {
	Scan(...any) error
}) (TemplateVariant, error) {
	var v TemplateVariant
	err := rows.Scan(&v.ID, &v.FragmentKey, &v.ProjectID, &v.VariantName,
		&v.Description, &v.Content, &v.IsDefault, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}

const variantSelectCols = `id, fragment_key, project_id, variant_name, description, content, is_default, created_at, updated_at`

// listGlobalFragments — GET /scaffold/templates
// Returns each fragment key with all its global variants grouped.
func (h *Handler) listGlobalFragments(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+variantSelectCols+` FROM scaffold_template_fragments
		 WHERE project_id IS NULL ORDER BY fragment_key, variant_name`)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	groups := map[string]*FragmentGroup{}
	order := []string{}
	for rows.Next() {
		v, err := scanVariant(rows)
		if err != nil {
			continue
		}
		if _, ok := groups[v.FragmentKey]; !ok {
			groups[v.FragmentKey] = &FragmentGroup{
				FragmentKey: v.FragmentKey,
				Description: scaffoldFragmentDescriptions[v.FragmentKey],
			}
			order = append(order, v.FragmentKey)
		}
		groups[v.FragmentKey].Variants = append(groups[v.FragmentKey].Variants, v)
	}

	result := make([]FragmentGroup, 0, len(order))
	for _, key := range order {
		result = append(result, *groups[key])
	}
	jsonResp(w, 200, result)
}

// listProjectFragments — GET /projects/{pid}/scaffold/templates
func (h *Handler) listProjectFragments(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+variantSelectCols+` FROM scaffold_template_fragments
		 WHERE project_id = $1 ORDER BY fragment_key, variant_name`, pid)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	groups := map[string]*FragmentGroup{}
	order := []string{}
	for rows.Next() {
		v, err := scanVariant(rows)
		if err != nil {
			continue
		}
		if _, ok := groups[v.FragmentKey]; !ok {
			groups[v.FragmentKey] = &FragmentGroup{
				FragmentKey: v.FragmentKey,
				Description: scaffoldFragmentDescriptions[v.FragmentKey],
			}
			order = append(order, v.FragmentKey)
		}
		groups[v.FragmentKey].Variants = append(groups[v.FragmentKey].Variants, v)
	}

	result := make([]FragmentGroup, 0, len(order))
	for _, key := range order {
		result = append(result, *groups[key])
	}
	jsonResp(w, 200, result)
}

// getVariant — GET /scaffold/templates/variants/{id}
func (h *Handler) getVariant(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row := h.pool.QueryRow(r.Context(),
		`SELECT `+variantSelectCols+` FROM scaffold_template_fragments WHERE id=$1`, id)
	v, err := scanVariant(row)
	if isNotFound(err) {
		apiError(w, 404, "variant not found")
		return
	}
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, v)
}

// createGlobalVariant — POST /scaffold/templates/{key}/variants
func (h *Handler) createGlobalVariant(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	var body struct {
		VariantName string `json:"variant_name"`
		Description string `json:"description"`
		Content     string `json:"content"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.VariantName) == "" || strings.TrimSpace(body.Content) == "" {
		apiError(w, 400, "variant_name and content are required")
		return
	}
	row := h.pool.QueryRow(r.Context(),
		`INSERT INTO scaffold_template_fragments
		    (fragment_key, project_id, variant_name, description, content, is_default)
		 VALUES ($1, NULL, $2, $3, $4, false)
		 RETURNING `+variantSelectCols,
		key, strings.TrimSpace(body.VariantName), body.Description, body.Content)
	v, err := scanVariant(row)
	if err != nil {
		if strings.Contains(err.Error(), "uq_stf_global_variant") {
			apiError(w, 409, "a variant with that name already exists for this fragment")
			return
		}
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, v)
}

// createProjectVariant — POST /projects/{pid}/scaffold/templates/{key}/variants
func (h *Handler) createProjectVariant(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	key := r.PathValue("key")
	var body struct {
		VariantName string `json:"variant_name"`
		Description string `json:"description"`
		Content     string `json:"content"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.VariantName) == "" || strings.TrimSpace(body.Content) == "" {
		apiError(w, 400, "variant_name and content are required")
		return
	}
	row := h.pool.QueryRow(r.Context(),
		`INSERT INTO scaffold_template_fragments
		    (fragment_key, project_id, variant_name, description, content, is_default)
		 VALUES ($1, $2, $3, $4, $5, false)
		 RETURNING `+variantSelectCols,
		key, pid, strings.TrimSpace(body.VariantName), body.Description, body.Content)
	v, err := scanVariant(row)
	if err != nil {
		if strings.Contains(err.Error(), "uq_stf_project_variant") {
			apiError(w, 409, "a variant with that name already exists for this fragment")
			return
		}
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, v)
}

// updateVariant — PUT /scaffold/templates/variants/{id}
func (h *Handler) updateVariant(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		VariantName string `json:"variant_name"`
		Description string `json:"description"`
		Content     string `json:"content"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Content) == "" {
		apiError(w, 400, "content is required")
		return
	}
	row := h.pool.QueryRow(r.Context(),
		`UPDATE scaffold_template_fragments
		 SET content=$2, description=$3, updated_at=now()
		 WHERE id=$1
		 RETURNING `+variantSelectCols,
		id, body.Content, body.Description)
	v, err := scanVariant(row)
	if isNotFound(err) {
		apiError(w, 404, "variant not found")
		return
	}
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, v)
}

// deleteVariant — DELETE /scaffold/templates/variants/{id}
func (h *Handler) deleteVariant(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	// Refuse to delete the last variant for a key+scope, or the current default
	var isDefault bool
	var fragmentKey string
	var projectID *string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT is_default, fragment_key, project_id FROM scaffold_template_fragments WHERE id=$1`, id,
	).Scan(&isDefault, &fragmentKey, &projectID); err != nil {
		apiError(w, 404, "variant not found")
		return
	}
	if isDefault {
		apiError(w, 409, "cannot delete the default variant — set another as default first")
		return
	}
	// Check it's not the only one
	var count int
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM scaffold_template_fragments
		 WHERE fragment_key=$1 AND (project_id=$2 OR (project_id IS NULL AND $2 IS NULL))`,
		fragmentKey, projectID,
	).Scan(&count)
	if count <= 1 {
		apiError(w, 409, "cannot delete the only variant for this fragment")
		return
	}
	h.pool.Exec(r.Context(), `DELETE FROM scaffold_template_fragments WHERE id=$1`, id) //nolint:errcheck
	w.WriteHeader(204)
}

// setDefaultVariant — POST /scaffold/templates/variants/{id}/default
func (h *Handler) setDefaultVariant(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var fragmentKey string
	var projectID *string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT fragment_key, project_id FROM scaffold_template_fragments WHERE id=$1`, id,
	).Scan(&fragmentKey, &projectID); err != nil {
		apiError(w, 404, "variant not found")
		return
	}
	// Transactional swap
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer tx.Rollback(r.Context()) //nolint:errcheck

	if projectID == nil {
		_, err = tx.Exec(r.Context(),
			`UPDATE scaffold_template_fragments SET is_default=false
			 WHERE fragment_key=$1 AND project_id IS NULL`, fragmentKey)
	} else {
		_, err = tx.Exec(r.Context(),
			`UPDATE scaffold_template_fragments SET is_default=false
			 WHERE fragment_key=$1 AND project_id=$2`, fragmentKey, *projectID)
	}
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	if _, err = tx.Exec(r.Context(),
		`UPDATE scaffold_template_fragments SET is_default=true, updated_at=now() WHERE id=$1`, id,
	); err != nil {
		apiError(w, 500, "internal error")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		apiError(w, 500, "internal error")
		return
	}
	w.WriteHeader(204)
}

// resetVariant — POST /scaffold/templates/variants/{id}/reset
func (h *Handler) resetVariant(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var fragmentKey string
	if err := h.pool.QueryRow(r.Context(),
		`SELECT fragment_key FROM scaffold_template_fragments WHERE id=$1`, id,
	).Scan(&fragmentKey); err != nil {
		apiError(w, 404, "variant not found")
		return
	}
	def, ok := scaffoldDefaultTemplates[fragmentKey]
	if !ok {
		apiError(w, 404, "no hardcoded default for this fragment key")
		return
	}
	if _, err := h.pool.Exec(r.Context(),
		`UPDATE scaffold_template_fragments SET content=$2, updated_at=now() WHERE id=$1`, id, def,
	); err != nil {
		apiError(w, 500, "internal error")
		return
	}
	w.WriteHeader(204)
}

// copyTemplatesToProject — POST /projects/{pid}/scaffold/templates
func (h *Handler) copyTemplatesToProject(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	if err := CopyGlobalTemplatesToProject(r.Context(), h.pool, pid); err != nil {
		h.log.Error("copy templates to project", "project", pid, "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.WriteHeader(204)
}
