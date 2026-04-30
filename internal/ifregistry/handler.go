package ifregistry

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool *pgxpool.Pool
	log  *slog.Logger
}

func New(pool *pgxpool.Pool, log *slog.Logger) *Handler {
	return &Handler{pool: pool, log: log}
}

func (h *Handler) Register(mux *http.ServeMux) {
	// Systems
	mux.HandleFunc("GET /projects/{pid}/systems",          h.listSystems)
	mux.HandleFunc("POST /projects/{pid}/systems",         h.createSystem)
	mux.HandleFunc("PUT /projects/{pid}/systems/{id}",     h.updateSystem)
	mux.HandleFunc("DELETE /projects/{pid}/systems/{id}",  h.deleteSystem)

	// Interfaces
	mux.HandleFunc("GET /projects/{pid}/interfaces",             h.listInterfaces)
	mux.HandleFunc("POST /projects/{pid}/interfaces",            h.createInterface)
	mux.HandleFunc("GET /projects/{pid}/interfaces/{id}",        h.getInterface)
	mux.HandleFunc("PUT /projects/{pid}/interfaces/{id}",        h.updateInterface)
	mux.HandleFunc("DELETE /projects/{pid}/interfaces/{id}",     h.deleteInterface)

	// Receivers
	mux.HandleFunc("POST /projects/{pid}/interfaces/{id}/receivers",           h.addReceiver)
	mux.HandleFunc("PUT /projects/{pid}/interfaces/{id}/receivers/{rid}",      h.updateReceiver)
	mux.HandleFunc("DELETE /projects/{pid}/interfaces/{id}/receivers/{rid}",   h.deleteReceiver)

	// Global config (system types, infra types, integration platforms)
	mux.HandleFunc("GET /config/{key}",  h.getConfig)
	mux.HandleFunc("PUT /config/{key}",  h.putConfig)
}

func jsonResp(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func apiError(w http.ResponseWriter, status int, msg string) {
	jsonResp(w, status, map[string]string{"error": msg})
}

func decode(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}

func isNotFound(err error) bool {
	return err == pgx.ErrNoRows
}
