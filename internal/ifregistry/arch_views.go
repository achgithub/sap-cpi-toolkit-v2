package ifregistry

import (
	"encoding/json"
	"net/http"
	"time"
)

type ArchView struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Owner     string          `json:"owner"`
	Filter    json.RawMessage `json:"filter"`
	IsDefault bool            `json:"is_default"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func (h *Handler) listArchViews(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, name, owner, filter, is_default, created_at, updated_at FROM architecture_views ORDER BY name`)
	if err != nil {
		h.log.Error("list arch views", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()
	views := []ArchView{}
	for rows.Next() {
		var v ArchView
		var raw json.RawMessage
		if err := rows.Scan(&v.ID, &v.Name, &v.Owner, &raw, &v.IsDefault, &v.CreatedAt, &v.UpdatedAt); err != nil {
			h.log.Error("scan arch view", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		v.Filter = raw
		views = append(views, v)
	}
	jsonResp(w, 200, views)
}

func (h *Handler) createArchView(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name   string          `json:"name"`
		Owner  string          `json:"owner"`
		Filter json.RawMessage `json:"filter"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name required")
		return
	}
	var v ArchView
	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO architecture_views (name, owner, filter)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (name) DO UPDATE SET owner=EXCLUDED.owner, filter=EXCLUDED.filter, updated_at=now()
		 RETURNING id, name, owner, filter, is_default, created_at, updated_at`,
		body.Name, body.Owner, body.Filter,
	).Scan(&v.ID, &v.Name, &v.Owner, &raw, &v.IsDefault, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		h.log.Error("upsert arch view", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	v.Filter = raw
	jsonResp(w, 200, v)
}

func (h *Handler) setDefaultArchView(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	// Clear any existing default, then set the new one — two statements in one transaction.
	_, err := h.pool.Exec(r.Context(),
		`UPDATE architecture_views SET is_default = (id = $1), updated_at = now()
		 WHERE is_default = TRUE OR id = $1`,
		id)
	if err != nil {
		h.log.Error("set default arch view", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) clearDefaultArchView(w http.ResponseWriter, r *http.Request) {
	_, err := h.pool.Exec(r.Context(),
		`UPDATE architecture_views SET is_default = FALSE, updated_at = now() WHERE is_default = TRUE`)
	if err != nil {
		h.log.Error("clear default arch view", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) deleteArchView(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(), `DELETE FROM architecture_views WHERE id=$1`, id)
	if err != nil {
		h.log.Error("delete arch view", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}
