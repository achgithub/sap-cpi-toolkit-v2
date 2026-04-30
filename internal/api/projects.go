package api

import (
	"net/http"
	"time"
)

type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (h *Handler) listProjects(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, name, description, created_at, updated_at FROM projects ORDER BY name`)
	if err != nil {
		h.log.Error("list projects", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt); err != nil {
			h.log.Error("scan project", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		projects = append(projects, p)
	}
	jsonResp(w, 200, projects)
}

func (h *Handler) createProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	var p Project
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO projects (name, description) VALUES ($1, $2)
		 RETURNING id, name, description, created_at, updated_at`,
		body.Name, body.Description,
	).Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		h.log.Error("create project", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if err := CopyGlobalTemplatesToProject(r.Context(), h.pool, p.ID); err != nil {
		h.log.Error("copy templates to new project", "project", p.ID, "error", err)
	}
	h.log.Info("project created", "id", p.ID, "name", p.Name, "user", userID(r))
	jsonResp(w, 201, p)
}

func (h *Handler) getProject(w http.ResponseWriter, r *http.Request) {
	var p Project
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, name, description, created_at, updated_at FROM projects WHERE id = $1`,
		r.PathValue("id"),
	).Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt)
	if isNotFound(err) {
		apiError(w, 404, "project not found")
		return
	}
	if err != nil {
		h.log.Error("get project", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, p)
}

func (h *Handler) updateProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	var p Project
	err := h.pool.QueryRow(r.Context(),
		`UPDATE projects SET name=$1, description=$2, updated_at=NOW()
		 WHERE id=$3 RETURNING id, name, description, created_at, updated_at`,
		body.Name, body.Description, r.PathValue("id"),
	).Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt)
	if isNotFound(err) {
		apiError(w, 404, "project not found")
		return
	}
	if err != nil {
		h.log.Error("update project", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, p)
}

func (h *Handler) deleteProject(w http.ResponseWriter, r *http.Request) {
	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM projects WHERE id=$1`, r.PathValue("id"))
	if err != nil {
		h.log.Error("delete project", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		apiError(w, 404, "project not found")
		return
	}
	w.WriteHeader(204)
}
