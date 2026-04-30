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

var scaffoldTemplateDescriptions = map[string]string{
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

// SeedScaffoldTemplates inserts built-in templates that don't already exist.
// Existing (possibly customised) templates are left untouched.
func SeedScaffoldTemplates(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) {
	inserted := 0
	for key, content := range scaffoldDefaultTemplates {
		var exists bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM scaffold_templates WHERE key=$1)`, key,
		).Scan(&exists); err != nil {
			log.Error("scaffold template seed: check failed", "key", key, "error", err)
			continue
		}
		if exists {
			continue
		}
		desc := scaffoldTemplateDescriptions[key]
		if _, err := pool.Exec(ctx,
			`INSERT INTO scaffold_templates (key, description, content) VALUES ($1,$2,$3)`,
			key, desc, content,
		); err != nil {
			log.Error("scaffold template seed: insert failed", "key", key, "error", err)
		} else {
			inserted++
		}
	}
	if inserted > 0 {
		log.Info("scaffold templates: seeded new entries", "count", inserted)
	}
}

// LoadScaffoldTemplates fetches all templates from DB, falling back to
// hardcoded defaults for any key that is missing.
func LoadScaffoldTemplates(ctx context.Context, pool *pgxpool.Pool) map[string]string {
	rows, err := pool.Query(ctx, `SELECT key, content FROM scaffold_templates`)
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
	// Fill any missing keys from hardcoded defaults
	for k, v := range scaffoldDefaultTemplates {
		if _, ok := result[k]; !ok {
			result[k] = v
		}
	}
	return result
}

// ── HTTP Handlers ─────────────────────────────────────────────────────────────

type ScaffoldTemplateRow struct {
	Key         string    `json:"key"`
	Description string    `json:"description"`
	Content     string    `json:"content"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (h *Handler) listScaffoldTemplates(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT key, description, content, updated_at FROM scaffold_templates ORDER BY key`)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()
	var templates []ScaffoldTemplateRow
	for rows.Next() {
		var t ScaffoldTemplateRow
		if err := rows.Scan(&t.Key, &t.Description, &t.Content, &t.UpdatedAt); err == nil {
			templates = append(templates, t)
		}
	}
	jsonResp(w, 200, templates)
}

func (h *Handler) getScaffoldTemplate(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	var t ScaffoldTemplateRow
	err := h.pool.QueryRow(r.Context(),
		`SELECT key, description, content, updated_at FROM scaffold_templates WHERE key=$1`, key,
	).Scan(&t.Key, &t.Description, &t.Content, &t.UpdatedAt)
	if err != nil {
		apiError(w, 404, "template not found")
		return
	}
	jsonResp(w, 200, t)
}

func (h *Handler) updateScaffoldTemplate(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	var body struct {
		Content string `json:"content"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Content) == "" {
		apiError(w, 400, "content is required")
		return
	}
	tag, err := h.pool.Exec(r.Context(),
		`UPDATE scaffold_templates SET content=$2, updated_at=now() WHERE key=$1`,
		key, body.Content)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "template not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) resetScaffoldTemplate(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	def, ok := scaffoldDefaultTemplates[key]
	if !ok {
		apiError(w, 404, "no default for this template key")
		return
	}
	tag, err := h.pool.Exec(r.Context(),
		`UPDATE scaffold_templates SET content=$2, updated_at=now() WHERE key=$1`, key, def)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "template not found")
		return
	}
	w.WriteHeader(204)
}
