package ifregistry

import (
	"net/http"
	"time"
)

type Dependency struct {
	ID            string    `json:"id"`
	InterfaceID   string    `json:"interface_id"`
	DependsOnID   string    `json:"depends_on_id"`
	DependsOnRef  string    `json:"depends_on_ref"`
	DependsOnName string    `json:"depends_on_name"`
	Kind          string    `json:"kind"`
	Note          string    `json:"note"`
	CreatedAt     time.Time `json:"created_at"`
}

type dependencyBody struct {
	DependsOnID string `json:"depends_on_id"`
	Kind        string `json:"kind"`
	Note        string `json:"note"`
}

func (h *Handler) listDependencies(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rows, err := h.pool.Query(r.Context(), `
		SELECT d.id, d.interface_id, d.depends_on_id,
		       t.ref, t.name,
		       d.kind, d.note, d.created_at
		FROM   interface_dependencies d
		JOIN   interfaces t ON t.id = d.depends_on_id
		WHERE  d.interface_id = $1
		ORDER  BY d.created_at`, id)
	if err != nil {
		h.log.Error("list dependencies", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	deps := []Dependency{}
	for rows.Next() {
		var dep Dependency
		if err := rows.Scan(&dep.ID, &dep.InterfaceID, &dep.DependsOnID,
			&dep.DependsOnRef, &dep.DependsOnName,
			&dep.Kind, &dep.Note, &dep.CreatedAt); err != nil {
			h.log.Error("scan dependency", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		deps = append(deps, dep)
	}
	jsonResp(w, 200, deps)
}

func (h *Handler) addDependency(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
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

	var dep Dependency
	err := h.pool.QueryRow(r.Context(), `
		WITH ins AS (
			INSERT INTO interface_dependencies (interface_id, depends_on_id, kind, note)
			VALUES ($1,$2,$3,$4)
			RETURNING id, interface_id, depends_on_id, kind, note, created_at
		)
		SELECT ins.id, ins.interface_id, ins.depends_on_id,
		       t.ref, t.name,
		       ins.kind, ins.note, ins.created_at
		FROM ins JOIN interfaces t ON t.id = ins.depends_on_id`,
		id, body.DependsOnID, body.Kind, body.Note,
	).Scan(&dep.ID, &dep.InterfaceID, &dep.DependsOnID,
		&dep.DependsOnRef, &dep.DependsOnName,
		&dep.Kind, &dep.Note, &dep.CreatedAt)
	if err != nil {
		h.log.Error("add dependency", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, dep)
}

func (h *Handler) deleteDependency(w http.ResponseWriter, r *http.Request) {
	did := r.PathValue("did")
	res, err := h.pool.Exec(r.Context(),
		`DELETE FROM interface_dependencies WHERE id=$1`, did)
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
