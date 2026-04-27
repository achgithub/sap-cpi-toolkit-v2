package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/sapclient"
)

// Handler holds shared state for all API route handlers.
type Handler struct {
	pool    *pgxpool.Pool
	log     *slog.Logger
	encKey  []byte
	sapPool *sapclient.Pool
}

// New creates a Handler.
func New(pool *pgxpool.Pool, log *slog.Logger, encKey []byte, sapPool *sapclient.Pool) *Handler {
	return &Handler{pool: pool, log: log, encKey: encKey, sapPool: sapPool}
}

// Register wires all API routes onto mux.
func (h *Handler) Register(mux *http.ServeMux) {
	// Projects
	mux.HandleFunc("GET /projects",            h.listProjects)
	mux.HandleFunc("POST /projects",           h.createProject)
	mux.HandleFunc("GET /projects/{id}",       h.getProject)
	mux.HandleFunc("PUT /projects/{id}",       h.updateProject)
	mux.HandleFunc("DELETE /projects/{id}",    h.deleteProject)

	// Sub-projects
	mux.HandleFunc("GET /projects/{id}/sub-projects",             h.listSubProjects)
	mux.HandleFunc("POST /projects/{id}/sub-projects",            h.createSubProject)
	mux.HandleFunc("GET /projects/{id}/sub-projects/{spid}",      h.getSubProject)
	mux.HandleFunc("PUT /projects/{id}/sub-projects/{spid}",      h.updateSubProject)
	mux.HandleFunc("DELETE /projects/{id}/sub-projects/{spid}",   h.deleteSubProject)

	// Instances
	mux.HandleFunc("GET /projects/{id}/instances",           h.listInstances)
	mux.HandleFunc("POST /projects/{id}/instances",          h.createInstance)
	mux.HandleFunc("GET /projects/{id}/instances/{iid}",     h.getInstance)
	mux.HandleFunc("PUT /projects/{id}/instances/{iid}",     h.updateInstance)
	mux.HandleFunc("DELETE /projects/{id}/instances/{iid}",  h.deleteInstance)

	// Monitoring — messages
	mux.HandleFunc("GET /monitoring/{iid}/messages",             h.listMessages)
	mux.HandleFunc("GET /monitoring/{iid}/messages/{guid}",      h.getMessage)
	mux.HandleFunc("GET /monitoring/{iid}/messages/{guid}/error", h.getMessageError)

	// Monitoring — tiles
	mux.HandleFunc("GET /monitoring/{iid}/tiles",                h.listTiles)
	mux.HandleFunc("POST /monitoring/{iid}/tiles",               h.createTile)
	mux.HandleFunc("GET /monitoring/{iid}/tiles/{tid}/count",    h.getTileCount)
	mux.HandleFunc("DELETE /monitoring/{iid}/tiles/{tid}",       h.deleteTile)

	// Members
	mux.HandleFunc("GET /projects/{id}/members",          h.listMembers)
	mux.HandleFunc("POST /projects/{id}/members",         h.createMember)
	mux.HandleFunc("PUT /projects/{id}/members/{mid}",    h.updateMember)
	mux.HandleFunc("DELETE /projects/{id}/members/{mid}", h.deleteMember)

	// Keygen (stateless — no DB required)
	mux.HandleFunc("POST /keygen/pgp",  h.generatePGP)
	mux.HandleFunc("POST /keygen/ssh",  h.generateSSH)
	mux.HandleFunc("POST /keygen/cert", h.generateCert)
}

// ── helpers ───────────────────────────────────────────────────────────────────

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
	return errors.Is(err, pgx.ErrNoRows)
}

func userID(r *http.Request) string {
	return r.Header.Get("X-User-ID")
}
