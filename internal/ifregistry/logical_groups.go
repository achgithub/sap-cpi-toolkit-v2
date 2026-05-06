package ifregistry

import (
	"net/http"
	"time"
)

type LogicalGroup struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

const groupCols = `id, name, description, created_at, updated_at`

func scanGroup(scan scanFn) (LogicalGroup, error) {
	var g LogicalGroup
	err := scan(&g.ID, &g.Name, &g.Description, &g.CreatedAt, &g.UpdatedAt)
	return g, err
}

type groupBody struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *Handler) listLogicalGroups(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+groupCols+` FROM logical_groups ORDER BY name`)
	if err != nil {
		h.log.Error("list logical groups", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	groups := []LogicalGroup{}
	for rows.Next() {
		g, err := scanGroup(rows.Scan)
		if err != nil {
			h.log.Error("scan logical group", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		groups = append(groups, g)
	}
	jsonResp(w, 200, groups)
}

func (h *Handler) createLogicalGroup(w http.ResponseWriter, r *http.Request) {
	var body groupBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}

	g, err := scanGroup(h.pool.QueryRow(r.Context(),
		`INSERT INTO logical_groups (name, description)
		 VALUES ($1,$2) RETURNING `+groupCols,
		body.Name, body.Description,
	).Scan)
	if err != nil {
		h.log.Error("create logical group", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, g)
}

func (h *Handler) updateLogicalGroup(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body groupBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}

	g, err := scanGroup(h.pool.QueryRow(r.Context(),
		`UPDATE logical_groups SET name=$1, description=$2, updated_at=now()
		 WHERE id=$3 RETURNING `+groupCols,
		body.Name, body.Description, id,
	).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update logical group", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, g)
}

func (h *Handler) deleteLogicalGroup(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(), `DELETE FROM logical_groups WHERE id=$1`, id)
	if err != nil {
		h.log.Error("delete logical group", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}
