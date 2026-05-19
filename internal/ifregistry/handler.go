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
	mux.HandleFunc("GET /systems",                  h.listSystems)
	mux.HandleFunc("POST /systems",                 h.createSystem)
	mux.HandleFunc("PUT /systems/{id}",             h.updateSystem)
	mux.HandleFunc("PATCH /systems/{id}/pos",       h.updateSystemPos)
	mux.HandleFunc("POST /systems/{id}/archive",    h.archiveSystem)
	mux.HandleFunc("POST /systems/{id}/unarchive",  h.unarchiveSystem)

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
	mux.HandleFunc("DELETE /interfaces/{id}",         h.deleteInterface)
	mux.HandleFunc("POST /interfaces/{id}/archive",   h.archiveInterface)

	// Receivers
	mux.HandleFunc("POST /interfaces/{id}/receivers",         h.addReceiver)
	mux.HandleFunc("PUT /interfaces/{id}/receivers/{rid}",    h.updateReceiver)
	mux.HandleFunc("DELETE /interfaces/{id}/receivers/{rid}", h.deleteReceiver)

	// Dependencies
	mux.HandleFunc("GET /interfaces/{id}/dependencies",          h.listDependencies)
	mux.HandleFunc("POST /interfaces/{id}/dependencies",         h.addDependency)
	mux.HandleFunc("DELETE /interfaces/{id}/dependencies/{did}", h.deleteDependency)

	// Flow diagram state
	mux.HandleFunc("GET /interfaces/{id}/flow-diagram",     h.getInterfaceFlowDiagram)
	mux.HandleFunc("PUT /interfaces/{id}/flow-diagram",     h.putInterfaceFlowDiagram)
	mux.HandleFunc("GET /logical-groups/{id}/flow-diagram", h.getGroupFlowDiagram)
	mux.HandleFunc("PUT /logical-groups/{id}/flow-diagram", h.putGroupFlowDiagram)

	// Architecture diagram
	mux.HandleFunc("GET /diagram",    h.getDiagram)
	mux.HandleFunc("GET /v2/diagram", h.getDiagramV2)

	// Registry config
	mux.HandleFunc("GET /config/{key}", h.getConfig)
	mux.HandleFunc("PUT /config/{key}", h.putConfig)

	// ── V2 routes — new schema, coexists with v1 ──────────────────────────────

	// Integration components
	mux.HandleFunc("GET /v2/components",                   h.listComponents)
	mux.HandleFunc("POST /v2/components",                  h.createComponent)
	mux.HandleFunc("PUT /v2/components/{id}",              h.updateComponent)
	mux.HandleFunc("POST /v2/components/{id}/archive",     h.archiveComponent)
	mux.HandleFunc("POST /v2/components/{id}/unarchive",   h.unarchiveComponent)

	// Interfaces v2
	mux.HandleFunc("GET /v2/interfaces",                   h.listInterfacesV2)
	mux.HandleFunc("POST /v2/interfaces",                  h.createInterfaceV2)
	mux.HandleFunc("GET /v2/interfaces/{id}",              h.getInterfaceV2)
	mux.HandleFunc("PUT /v2/interfaces/{id}",              h.updateInterfaceV2)
	mux.HandleFunc("POST /v2/interfaces/{id}/archive",     h.archiveInterfaceV2)
	mux.HandleFunc("POST /v2/interfaces/{id}/unarchive",   h.unarchiveInterfaceV2)

	// Receivers v2
	mux.HandleFunc("POST /v2/interfaces/{id}/receivers",         h.addReceiverV2)
	mux.HandleFunc("PUT /v2/interfaces/{id}/receivers/{rid}",    h.updateReceiverV2)
	mux.HandleFunc("DELETE /v2/interfaces/{id}/receivers/{rid}", h.deleteReceiverV2)
	mux.HandleFunc("POST /v2/interfaces/{id}/receivers/{rid}/archive", h.archiveReceiverV2)

	// Dependencies v2
	mux.HandleFunc("GET /v2/interfaces/{id}/dependencies",          h.listDependenciesV2)
	mux.HandleFunc("POST /v2/interfaces/{id}/dependencies",         h.addDependencyV2)
	mux.HandleFunc("DELETE /v2/interfaces/{id}/dependencies/{did}", h.deleteDependencyV2)

	// Custom field definitions
	mux.HandleFunc("GET /v2/field-definitions",         h.listFieldDefs)
	mux.HandleFunc("POST /v2/field-definitions",        h.createFieldDef)
	mux.HandleFunc("PUT /v2/field-definitions/{id}",    h.updateFieldDef)
	mux.HandleFunc("DELETE /v2/field-definitions/{id}", h.deleteFieldDef)

	// Interface field values
	mux.HandleFunc("GET /v2/interfaces/{id}/fields",                        h.getInterfaceFields)
	mux.HandleFunc("PUT /v2/interfaces/{id}/fields",                        h.putInterfaceFields)
	mux.HandleFunc("GET /v2/interfaces/{id}/receivers/{rid}/fields",        h.getReceiverFields)
	mux.HandleFunc("PUT /v2/interfaces/{id}/receivers/{rid}/fields",        h.putReceiverFields)

	// Flow diagram v2
	mux.HandleFunc("GET /v2/interfaces/{id}/flow-diagram", h.getInterfaceV2FlowDiagram)
	mux.HandleFunc("PUT /v2/interfaces/{id}/flow-diagram", h.putInterfaceV2FlowDiagram)

	// Architecture saved views
	mux.HandleFunc("GET /v2/architecture-views",        h.listArchViews)
	mux.HandleFunc("POST /v2/architecture-views",       h.createArchView)
	mux.HandleFunc("DELETE /v2/architecture-views/{id}", h.deleteArchView)
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
