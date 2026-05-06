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
	// Systems (company-wide)
	mux.HandleFunc("GET /systems",         h.listSystems)
	mux.HandleFunc("POST /systems",        h.createSystem)
	mux.HandleFunc("PUT /systems/{id}",    h.updateSystem)
	mux.HandleFunc("DELETE /systems/{id}", h.deleteSystem)

	// Logical groups
	mux.HandleFunc("GET /logical-groups",          h.listLogicalGroups)
	mux.HandleFunc("POST /logical-groups",         h.createLogicalGroup)
	mux.HandleFunc("PUT /logical-groups/{id}",     h.updateLogicalGroup)
	mux.HandleFunc("DELETE /logical-groups/{id}",  h.deleteLogicalGroup)

	// Interfaces (company-wide)
	mux.HandleFunc("GET /interfaces",         h.listInterfaces)
	mux.HandleFunc("POST /interfaces",        h.createInterface)
	mux.HandleFunc("GET /interfaces/{id}",    h.getInterface)
	mux.HandleFunc("PUT /interfaces/{id}",    h.updateInterface)
	mux.HandleFunc("DELETE /interfaces/{id}", h.deleteInterface)

	// Receivers
	mux.HandleFunc("POST /interfaces/{id}/receivers",         h.addReceiver)
	mux.HandleFunc("PUT /interfaces/{id}/receivers/{rid}",    h.updateReceiver)
	mux.HandleFunc("DELETE /interfaces/{id}/receivers/{rid}", h.deleteReceiver)

	// Dependencies
	mux.HandleFunc("GET /interfaces/{id}/dependencies",          h.listDependencies)
	mux.HandleFunc("POST /interfaces/{id}/dependencies",         h.addDependency)
	mux.HandleFunc("DELETE /interfaces/{id}/dependencies/{did}", h.deleteDependency)

	// Architecture diagram
	mux.HandleFunc("GET /diagram", h.getDiagram)

	// Registry config
	mux.HandleFunc("GET /config/{key}", h.getConfig)
	mux.HandleFunc("PUT /config/{key}", h.putConfig)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

type scanFn func(dest ...any) error
