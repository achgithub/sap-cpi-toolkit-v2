package ifregistry

import (
	"net/http"
	"time"
)

type System struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"project_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	SystemType  string    `json:"system_type"`
	InfraType   string    `json:"infra_type"`
	InfraRegion string    `json:"infra_region"`
	PosX        float64   `json:"pos_x"`
	PosY        float64   `json:"pos_y"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

const systemCols = `id, project_id, name, description, system_type, infra_type, infra_region, pos_x, pos_y, created_at, updated_at`

func scanSystem(row interface{ Scan(...any) error }) (System, error) {
	var s System
	err := row.Scan(&s.ID, &s.ProjectID, &s.Name, &s.Description, &s.SystemType,
		&s.InfraType, &s.InfraRegion, &s.PosX, &s.PosY, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func (h *Handler) listSystems(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+systemCols+` FROM systems WHERE project_id=$1 ORDER BY name`, pid)
	if err != nil {
		h.log.Error("list systems", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()
	systems := []System{}
	for rows.Next() {
		s, err := scanSystem(rows)
		if err != nil {
			h.log.Error("scan system", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		systems = append(systems, s)
	}
	jsonResp(w, 200, systems)
}

func (h *Handler) createSystem(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	var body struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		SystemType  string  `json:"system_type"`
		InfraType   string  `json:"infra_type"`
		InfraRegion string  `json:"infra_region"`
		PosX        float64 `json:"pos_x"`
		PosY        float64 `json:"pos_y"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	s, err := scanSystem(h.pool.QueryRow(r.Context(),
		`INSERT INTO systems (project_id, name, description, system_type, infra_type, infra_region, pos_x, pos_y)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING `+systemCols,
		pid, body.Name, body.Description, body.SystemType, body.InfraType, body.InfraRegion, body.PosX, body.PosY,
	))
	if err != nil {
		h.log.Error("create system", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, s)
}

func (h *Handler) updateSystem(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	id := r.PathValue("id")
	var body struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		SystemType  string  `json:"system_type"`
		InfraType   string  `json:"infra_type"`
		InfraRegion string  `json:"infra_region"`
		PosX        float64 `json:"pos_x"`
		PosY        float64 `json:"pos_y"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	s, err := scanSystem(h.pool.QueryRow(r.Context(),
		`UPDATE systems SET name=$1, description=$2, system_type=$3, infra_type=$4, infra_region=$5,
		 pos_x=$6, pos_y=$7, updated_at=now()
		 WHERE id=$8 AND project_id=$9 RETURNING `+systemCols,
		body.Name, body.Description, body.SystemType, body.InfraType, body.InfraRegion,
		body.PosX, body.PosY, id, pid,
	))
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update system", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, s)
}

func (h *Handler) deleteSystem(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(),
		`DELETE FROM systems WHERE id=$1 AND project_id=$2`, id, pid)
	if err != nil {
		h.log.Error("delete system", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}
