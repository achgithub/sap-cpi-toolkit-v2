package ifregistry

import (
	"net/http"
	"time"
)

type System struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	SystemType  string    `json:"system_type"`
	InfraType   string    `json:"infra_type"`
	InfraRegion string    `json:"infra_region"`
	Description string    `json:"description"`
	OwnerType   string    `json:"owner_type"`
	PosX        float64   `json:"pos_x"`
	PosY        float64   `json:"pos_y"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

const systemCols = `id, name, system_type, infra_type, infra_region, description, owner_type, pos_x, pos_y, created_at, updated_at`

func scanSystem(row interface{ Scan(...any) error }) (System, error) {
	var s System
	err := row.Scan(&s.ID, &s.Name, &s.SystemType, &s.InfraType, &s.InfraRegion,
		&s.Description, &s.OwnerType, &s.PosX, &s.PosY, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

type systemBody struct {
	Name        string  `json:"name"`
	SystemType  string  `json:"system_type"`
	InfraType   string  `json:"infra_type"`
	InfraRegion string  `json:"infra_region"`
	Description string  `json:"description"`
	OwnerType   string  `json:"owner_type"`
	PosX        float64 `json:"pos_x"`
	PosY        float64 `json:"pos_y"`
}

func (h *Handler) listSystems(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+systemCols+` FROM systems ORDER BY name`)
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
	var body systemBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.OwnerType == "" {
		body.OwnerType = "internal"
	}

	s, err := scanSystem(h.pool.QueryRow(r.Context(),
		`INSERT INTO systems (name, system_type, infra_type, infra_region, description, owner_type, pos_x, pos_y)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 RETURNING `+systemCols,
		body.Name, body.SystemType, body.InfraType, body.InfraRegion,
		body.Description, body.OwnerType, body.PosX, body.PosY,
	))
	if err != nil {
		h.log.Error("create system", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, s)
}

func (h *Handler) updateSystem(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body systemBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}

	s, err := scanSystem(h.pool.QueryRow(r.Context(),
		`UPDATE systems SET
		 name=$1, system_type=$2, infra_type=$3, infra_region=$4,
		 description=$5, owner_type=$6, pos_x=$7, pos_y=$8, updated_at=now()
		 WHERE id=$9
		 RETURNING `+systemCols,
		body.Name, body.SystemType, body.InfraType, body.InfraRegion,
		body.Description, body.OwnerType, body.PosX, body.PosY, id,
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
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(), `DELETE FROM systems WHERE id=$1`, id)
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
