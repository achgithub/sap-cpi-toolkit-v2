package ifregistry

import (
	"encoding/json"
	"net/http"
)

func (h *Handler) getConfig(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	var raw json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`SELECT value FROM registry_config WHERE key=$1`, key,
	).Scan(&raw)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("get config", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	w.Write(raw) //nolint:errcheck
}

func (h *Handler) putConfig(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		apiError(w, 400, "invalid JSON")
		return
	}

	_, err := h.pool.Exec(r.Context(),
		`INSERT INTO registry_config (key, value) VALUES ($1,$2)
		 ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`,
		key, raw,
	)
	if err != nil {
		h.log.Error("put config", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	w.WriteHeader(204)
}
