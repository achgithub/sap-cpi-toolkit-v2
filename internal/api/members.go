package api

import (
	"net/http"
	"time"
)

type Member struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	UserID    string    `json:"user_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *Handler) listMembers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, project_id, user_id, role, created_at
		 FROM project_members WHERE project_id=$1 ORDER BY user_id`,
		r.PathValue("id"))
	if err != nil {
		h.log.Error("list members", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	members := []Member{}
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.ID, &m.ProjectID, &m.UserID, &m.Role, &m.CreatedAt); err != nil {
			h.log.Error("scan member", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		members = append(members, m)
	}
	jsonResp(w, 200, members)
}

func (h *Handler) createMember(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if body.UserID == "" {
		apiError(w, 400, "user_id is required")
		return
	}
	if !validRole(body.Role) {
		apiError(w, 400, "role must be admin, developer, tester or viewer")
		return
	}
	var m Member
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3)
		 ON CONFLICT (project_id, user_id) DO UPDATE SET role=EXCLUDED.role
		 RETURNING id, project_id, user_id, role, created_at`,
		r.PathValue("id"), body.UserID, body.Role,
	).Scan(&m.ID, &m.ProjectID, &m.UserID, &m.Role, &m.CreatedAt)
	if err != nil {
		h.log.Error("create member", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, m)
}

func (h *Handler) updateMember(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Role string `json:"role"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if !validRole(body.Role) {
		apiError(w, 400, "role must be admin, developer, tester or viewer")
		return
	}
	var m Member
	err := h.pool.QueryRow(r.Context(),
		`UPDATE project_members SET role=$1
		 WHERE id=$2 AND project_id=$3
		 RETURNING id, project_id, user_id, role, created_at`,
		body.Role, r.PathValue("mid"), r.PathValue("id"),
	).Scan(&m.ID, &m.ProjectID, &m.UserID, &m.Role, &m.CreatedAt)
	if isNotFound(err) {
		apiError(w, 404, "member not found")
		return
	}
	if err != nil {
		h.log.Error("update member", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, m)
}

func (h *Handler) deleteMember(w http.ResponseWriter, r *http.Request) {
	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM project_members WHERE id=$1 AND project_id=$2`,
		r.PathValue("mid"), r.PathValue("id"))
	if err != nil {
		h.log.Error("delete member", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		apiError(w, 404, "member not found")
		return
	}
	w.WriteHeader(204)
}

func validRole(r string) bool {
	switch r {
	case "admin", "developer", "tester", "viewer":
		return true
	}
	return false
}
