package ifregistry

import (
	"encoding/json"
	"net/http"
)

func (h *Handler) getInterfaceFlowDiagram(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var state json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT COALESCE(flow_diagram_state, 'null'::jsonb) FROM interfaces WHERE id=$1`, id,
	).Scan(&state)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("get interface flow diagram", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(state) //nolint:errcheck
}

func (h *Handler) putInterfaceFlowDiagram(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	defer r.Body.Close()
	var body json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	_, err := h.pool.Exec(r.Context(),
		`UPDATE interfaces SET flow_diagram_state=$1 WHERE id=$2`, body, id,
	)
	if err != nil {
		h.log.Error("put interface flow diagram", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) getGroupFlowDiagram(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var state json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT COALESCE(flow_diagram_state, 'null'::jsonb) FROM logical_groups WHERE id=$1`, id,
	).Scan(&state)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("get group flow diagram", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(state) //nolint:errcheck
}

func (h *Handler) putGroupFlowDiagram(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	defer r.Body.Close()
	var body json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	_, err := h.pool.Exec(r.Context(),
		`UPDATE logical_groups SET flow_diagram_state=$1 WHERE id=$2`, body, id,
	)
	if err != nil {
		h.log.Error("put group flow diagram", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
