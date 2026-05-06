package ifregistry

import (
	"net/http"
	"time"
)

type InterfaceDependency struct {
	ID            string    `json:"id"`
	ProjectID     string    `json:"project_id"`
	InterfaceID   string    `json:"interface_id"`
	DependsOnID   string    `json:"depends_on_id"`
	Kind          string    `json:"kind"`
	Note          string    `json:"note"`
	CreatedAt     time.Time `json:"created_at"`
	DependsOnRef  string    `json:"depends_on_ref"`
	DependsOnName string    `json:"depends_on_name"`
}

type dependencyBody struct {
	DependsOnID string `json:"depends_on_id"`
	Kind        string `json:"kind"`
	Note        string `json:"note"`
}

func (h *Handler) listDependencies(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	id  := r.PathValue("id")

	rows, err := h.pool.Query(r.Context(), `
		SELECT d.id, d.project_id, d.interface_id, d.depends_on_id, d.kind, d.note, d.created_at,
		       COALESCE(i.interface_ref, '') AS depends_on_ref,
		       COALESCE(i.name, '')          AS depends_on_name
		FROM   interface_dependencies d
		LEFT   JOIN interfaces i ON i.id = d.depends_on_id
		WHERE  d.project_id=$1 AND d.interface_id=$2
		ORDER  BY d.created_at`, pid, id)
	if err != nil {
		h.log.Error("list dependencies", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	deps := []InterfaceDependency{}
	for rows.Next() {
		var dep InterfaceDependency
		if err := rows.Scan(&dep.ID, &dep.ProjectID, &dep.InterfaceID, &dep.DependsOnID,
			&dep.Kind, &dep.Note, &dep.CreatedAt, &dep.DependsOnRef, &dep.DependsOnName); err != nil {
			h.log.Error("scan dependency", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		deps = append(deps, dep)
	}
	jsonResp(w, 200, deps)
}

func (h *Handler) addDependency(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	id  := r.PathValue("id")

	var body dependencyBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.DependsOnID == "" {
		apiError(w, 400, "depends_on_id is required")
		return
	}
	if body.Kind == "" {
		body.Kind = "chains_to"
	}

	var dep InterfaceDependency
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO interface_dependencies (project_id, interface_id, depends_on_id, kind, note)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, project_id, interface_id, depends_on_id, kind, note, created_at`,
		pid, id, body.DependsOnID, body.Kind, body.Note,
	).Scan(&dep.ID, &dep.ProjectID, &dep.InterfaceID, &dep.DependsOnID,
		&dep.Kind, &dep.Note, &dep.CreatedAt)
	if err != nil {
		h.log.Error("add dependency", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	// Enrich with depends_on ref and name
	h.pool.QueryRow(r.Context(), //nolint:errcheck
		`SELECT COALESCE(interface_ref,''), name FROM interfaces WHERE id=$1`, body.DependsOnID,
	).Scan(&dep.DependsOnRef, &dep.DependsOnName)

	jsonResp(w, 201, dep)
}

func (h *Handler) deleteDependency(w http.ResponseWriter, r *http.Request) {
	did := r.PathValue("did")

	res, err := h.pool.Exec(r.Context(), `DELETE FROM interface_dependencies WHERE id=$1`, did)
	if err != nil {
		h.log.Error("delete dependency", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}
