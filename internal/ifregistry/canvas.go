package ifregistry

import (
	"net/http"
	"time"
)

type CanvasElement struct {
	ID          string    `json:"id"`
	InterfaceID string    `json:"interface_id"`
	Kind        string    `json:"kind"`
	SystemID    *string   `json:"system_id"`
	Label       string    `json:"label"`
	Body        string    `json:"body"`
	PosX        float64   `json:"pos_x"`
	PosY        float64   `json:"pos_y"`
	Width       float64   `json:"width"`
	Height      float64   `json:"height"`
	Color       string    `json:"color"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type canvasElementBody struct {
	Kind      string  `json:"kind"`
	SystemID  *string `json:"system_id"`
	Label     string  `json:"label"`
	Body      string  `json:"body"`
	PosX      float64 `json:"pos_x"`
	PosY      float64 `json:"pos_y"`
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	Color     string  `json:"color"`
	SortOrder int     `json:"sort_order"`
}

const canvasCols = `id, interface_id, kind, system_id, label, body, pos_x, pos_y, width, height, color, sort_order, created_at, updated_at`

// Only user-added element kinds may be deleted via the API.
var userKinds = map[string]bool{
	"text": true, "firewall": true, "step": true, "boundary": true,
}

func (h *Handler) listCanvas(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	rows, err := h.pool.Query(r.Context(),
		`SELECT `+canvasCols+` FROM interface_canvas_elements WHERE interface_id=$1 ORDER BY sort_order, created_at`, id)
	if err != nil {
		h.log.Error("list canvas", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	elems := []CanvasElement{}
	for rows.Next() {
		el, err := scanCanvasElement(rows.Scan)
		if err != nil {
			h.log.Error("scan canvas element", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		elems = append(elems, el)
	}
	jsonResp(w, 200, elems)
}

func (h *Handler) addCanvas(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var body canvasElementBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Kind == "" {
		apiError(w, 400, "kind is required")
		return
	}
	if body.Width == 0  { body.Width = 180 }
	if body.Height == 0 { body.Height = 80 }

	el, err := scanCanvasElement(h.pool.QueryRow(r.Context(),
		`INSERT INTO interface_canvas_elements
		 (interface_id, kind, system_id, label, body, pos_x, pos_y, width, height, color, sort_order)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		 RETURNING `+canvasCols,
		id, body.Kind, body.SystemID, body.Label, body.Body,
		body.PosX, body.PosY, body.Width, body.Height, body.Color, body.SortOrder,
	).Scan)
	if err != nil {
		h.log.Error("add canvas element", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, el)
}

func (h *Handler) updateCanvas(w http.ResponseWriter, r *http.Request) {
	eid := r.PathValue("eid")

	var body canvasElementBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}

	el, err := scanCanvasElement(h.pool.QueryRow(r.Context(),
		`UPDATE interface_canvas_elements SET
		 system_id=$1, label=$2, body=$3, pos_x=$4, pos_y=$5, width=$6, height=$7,
		 color=$8, sort_order=$9, updated_at=now()
		 WHERE id=$10
		 RETURNING `+canvasCols,
		body.SystemID, body.Label, body.Body,
		body.PosX, body.PosY, body.Width, body.Height,
		body.Color, body.SortOrder, eid,
	).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update canvas element", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, el)
}

func (h *Handler) deleteCanvas(w http.ResponseWriter, r *http.Request) {
	eid := r.PathValue("eid")

	var kind string
	err := h.pool.QueryRow(r.Context(),
		`SELECT kind FROM interface_canvas_elements WHERE id=$1`, eid).Scan(&kind)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("check canvas kind", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if !userKinds[kind] {
		apiError(w, 400, "cannot delete auto-managed canvas element")
		return
	}

	res, err := h.pool.Exec(r.Context(), `DELETE FROM interface_canvas_elements WHERE id=$1`, eid)
	if err != nil {
		h.log.Error("delete canvas element", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

func scanCanvasElement(scan scanFn) (CanvasElement, error) {
	var el CanvasElement
	err := scan(
		&el.ID, &el.InterfaceID, &el.Kind, &el.SystemID,
		&el.Label, &el.Body,
		&el.PosX, &el.PosY, &el.Width, &el.Height,
		&el.Color, &el.SortOrder,
		&el.CreatedAt, &el.UpdatedAt,
	)
	return el, err
}
