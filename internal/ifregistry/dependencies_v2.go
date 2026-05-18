package ifregistry

import (
	"net/http"
	"time"
)

type DependencyV2 struct {
	ID          string    `json:"id"`
	InterfaceID string    `json:"interface_id"`
	DependsOnID string    `json:"depends_on_id"`
	DependsOnRef  string  `json:"depends_on_ref"`
	DependsOnName string  `json:"depends_on_name"`
	Kind        string    `json:"kind"`
	Note        string    `json:"note"`
	CreatedAt   time.Time `json:"created_at"`
}

type dependencyV2Body struct {
	DependsOnID string `json:"depends_on_id"`
	Kind        string `json:"kind"`
	Note        string `json:"note"`
}

func (h *Handler) listDependenciesV2(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rows, err := h.pool.Query(r.Context(),
		`SELECT d.id, d.interface_id, d.depends_on_id,
		        COALESCE(i.ref,''), COALESCE(i.name,''),
		        d.kind, d.note, d.created_at
		 FROM interface_dependencies_v2 d
		 LEFT JOIN interfaces_v2 i ON i.id = d.depends_on_id
		 WHERE d.interface_id = $1
		 ORDER BY d.created_at`, id)
	if err != nil {
		h.log.Error("list dependencies v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	out := []DependencyV2{}
	for rows.Next() {
		var d DependencyV2
		if err := rows.Scan(&d.ID, &d.InterfaceID, &d.DependsOnID,
			&d.DependsOnRef, &d.DependsOnName, &d.Kind, &d.Note, &d.CreatedAt); err != nil {
			h.log.Error("scan dependency v2", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		out = append(out, d)
	}
	jsonResp(w, 200, out)
}

func (h *Handler) addDependencyV2(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body dependencyV2Body
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
	var d DependencyV2
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO interface_dependencies_v2 (interface_id, depends_on_id, kind, note)
		 VALUES ($1,$2,$3,$4)
		 RETURNING id, interface_id, depends_on_id, '', '', kind, note, created_at`,
		id, body.DependsOnID, body.Kind, body.Note,
	).Scan(&d.ID, &d.InterfaceID, &d.DependsOnID,
		&d.DependsOnRef, &d.DependsOnName, &d.Kind, &d.Note, &d.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			apiError(w, 400, "dependency already exists")
			return
		}
		h.log.Error("add dependency v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, d)
}

func (h *Handler) deleteDependencyV2(w http.ResponseWriter, r *http.Request) {
	did := r.PathValue("did")
	res, err := h.pool.Exec(r.Context(),
		`DELETE FROM interface_dependencies_v2 WHERE id=$1`, did)
	if err != nil {
		h.log.Error("delete dependency v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}
