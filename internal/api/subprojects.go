package api

import (
	"net/http"
	"time"
)

type SubProject struct {
	ID           string    `json:"id"`
	ProjectID    string    `json:"project_id"`
	Name         string    `json:"name"`
	Type         string    `json:"type"`
	CPIPackageID string    `json:"cpi_package_id,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (h *Handler) listSubProjects(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, project_id, name, type, COALESCE(cpi_package_id,''), created_at, updated_at
		 FROM sub_projects WHERE project_id=$1 ORDER BY name`,
		r.PathValue("id"))
	if err != nil {
		h.log.Error("list sub-projects", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	sps := []SubProject{}
	for rows.Next() {
		var sp SubProject
		if err := rows.Scan(&sp.ID, &sp.ProjectID, &sp.Name, &sp.Type, &sp.CPIPackageID,
			&sp.CreatedAt, &sp.UpdatedAt); err != nil {
			h.log.Error("scan sub-project", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		sps = append(sps, sp)
	}
	jsonResp(w, 200, sps)
}

func (h *Handler) createSubProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name         string `json:"name"`
		Type         string `json:"type"`
		CPIPackageID string `json:"cpi_package_id"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.Type != "interface" && body.Type != "library" {
		apiError(w, 400, "type must be 'interface' or 'library'")
		return
	}
	var sp SubProject
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO sub_projects (project_id, name, type, cpi_package_id)
		 VALUES ($1, $2, $3, NULLIF($4,''))
		 RETURNING id, project_id, name, type, COALESCE(cpi_package_id,''), created_at, updated_at`,
		r.PathValue("id"), body.Name, body.Type, body.CPIPackageID,
	).Scan(&sp.ID, &sp.ProjectID, &sp.Name, &sp.Type, &sp.CPIPackageID, &sp.CreatedAt, &sp.UpdatedAt)
	if err != nil {
		h.log.Error("create sub-project", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, sp)
}

func (h *Handler) getSubProject(w http.ResponseWriter, r *http.Request) {
	var sp SubProject
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, project_id, name, type, COALESCE(cpi_package_id,''), created_at, updated_at
		 FROM sub_projects WHERE id=$1 AND project_id=$2`,
		r.PathValue("spid"), r.PathValue("id"),
	).Scan(&sp.ID, &sp.ProjectID, &sp.Name, &sp.Type, &sp.CPIPackageID, &sp.CreatedAt, &sp.UpdatedAt)
	if isNotFound(err) {
		apiError(w, 404, "sub-project not found")
		return
	}
	if err != nil {
		h.log.Error("get sub-project", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, sp)
}

func (h *Handler) updateSubProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name         string `json:"name"`
		Type         string `json:"type"`
		CPIPackageID string `json:"cpi_package_id"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.Type != "interface" && body.Type != "library" {
		apiError(w, 400, "type must be 'interface' or 'library'")
		return
	}
	var sp SubProject
	err := h.pool.QueryRow(r.Context(),
		`UPDATE sub_projects SET name=$1, type=$2, cpi_package_id=NULLIF($3,''), updated_at=NOW()
		 WHERE id=$4 AND project_id=$5
		 RETURNING id, project_id, name, type, COALESCE(cpi_package_id,''), created_at, updated_at`,
		body.Name, body.Type, body.CPIPackageID, r.PathValue("spid"), r.PathValue("id"),
	).Scan(&sp.ID, &sp.ProjectID, &sp.Name, &sp.Type, &sp.CPIPackageID, &sp.CreatedAt, &sp.UpdatedAt)
	if isNotFound(err) {
		apiError(w, 404, "sub-project not found")
		return
	}
	if err != nil {
		h.log.Error("update sub-project", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, sp)
}

func (h *Handler) deleteSubProject(w http.ResponseWriter, r *http.Request) {
	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM sub_projects WHERE id=$1 AND project_id=$2`,
		r.PathValue("spid"), r.PathValue("id"))
	if err != nil {
		h.log.Error("delete sub-project", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		apiError(w, 404, "sub-project not found")
		return
	}
	w.WriteHeader(204)
}
