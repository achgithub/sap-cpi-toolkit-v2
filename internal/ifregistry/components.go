package ifregistry

import (
	"net/http"
	"time"
)

type Component struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	ComponentType string    `json:"component_type"`
	InfraType     string    `json:"infra_type"`
	InfraRegion   string    `json:"infra_region"`
	Description   string    `json:"description"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

const compCols = `id, name, component_type, infra_type, infra_region, description, created_at, updated_at`

func scanComponent(scan scanFn) (Component, error) {
	var c Component
	err := scan(&c.ID, &c.Name, &c.ComponentType, &c.InfraType, &c.InfraRegion, &c.Description, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

type componentBody struct {
	Name          string `json:"name"`
	ComponentType string `json:"component_type"`
	InfraType     string `json:"infra_type"`
	InfraRegion   string `json:"infra_region"`
	Description   string `json:"description"`
}

func (h *Handler) listComponents(w http.ResponseWriter, r *http.Request) {
	where := `WHERE archived_at IS NULL`
	if r.URL.Query().Get("include_archived") == "true" {
		where = ``
	}
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+compCols+` FROM integration_components `+where+` ORDER BY name`)
	if err != nil {
		h.log.Error("list components", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	out := []Component{}
	for rows.Next() {
		c, err := scanComponent(rows.Scan)
		if err != nil {
			h.log.Error("scan component", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		out = append(out, c)
	}
	jsonResp(w, 200, out)
}

func (h *Handler) createComponent(w http.ResponseWriter, r *http.Request) {
	var body componentBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	c, err := scanComponent(h.pool.QueryRow(r.Context(),
		`INSERT INTO integration_components (name, component_type, infra_type, infra_region, description)
		 VALUES ($1,$2,$3,$4,$5) RETURNING `+compCols,
		body.Name, body.ComponentType, body.InfraType, body.InfraRegion, body.Description,
	).Scan)
	if err != nil {
		h.log.Error("create component", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, c)
}

func (h *Handler) updateComponent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body componentBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	c, err := scanComponent(h.pool.QueryRow(r.Context(),
		`UPDATE integration_components SET
		 name=$1, component_type=$2, infra_type=$3, infra_region=$4, description=$5, updated_at=now()
		 WHERE id=$6 RETURNING `+compCols,
		body.Name, body.ComponentType, body.InfraType, body.InfraRegion, body.Description, id,
	).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update component", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, c)
}

func (h *Handler) archiveComponent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(),
		`UPDATE integration_components SET archived_at=now(), updated_at=now() WHERE id=$1 AND archived_at IS NULL`, id)
	if err != nil {
		h.log.Error("archive component", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) unarchiveComponent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	c, err := scanComponent(h.pool.QueryRow(r.Context(),
		`UPDATE integration_components SET archived_at=NULL, updated_at=now() WHERE id=$1 RETURNING `+compCols, id).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("unarchive component", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, c)
}
