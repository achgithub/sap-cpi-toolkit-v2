package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/sapclient"
)

// Handler holds shared state for all API route handlers.
type Handler struct {
	pool         *pgxpool.Pool
	log          *slog.Logger
	encKey       []byte
	sapPool      *sapclient.Pool
	sftpDataDir  string
	sched        *Scheduler
	mockTLSPort  string
	certHolder   *CertHolder
}

// New creates a Handler.
func New(pool *pgxpool.Pool, log *slog.Logger, encKey []byte, sapPool *sapclient.Pool) *Handler {
	return &Handler{
		pool:        pool,
		log:         log,
		encKey:      encKey,
		sapPool:     sapPool,
		sftpDataDir: os.Getenv("SFTP_DATA_DIR"),
	}
}

// WithScheduler attaches a running Scheduler to the Handler.
func (h *Handler) WithScheduler(s *Scheduler) *Handler {
	s.h = h
	h.sched = s
	return h
}

// WithMockTLS attaches the cert holder and port to the handler.
func (h *Handler) WithMockTLS(holder *CertHolder, port string) *Handler {
	h.certHolder = holder
	h.mockTLSPort = port
	return h
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
	mux.HandleFunc("GET /projects/{id}/instances",                       h.listInstances)
	mux.HandleFunc("POST /projects/{id}/instances",                      h.createInstance)
	mux.HandleFunc("GET /projects/{id}/instances/{iid}",                 h.getInstance)
	mux.HandleFunc("PUT /projects/{id}/instances/{iid}",                 h.updateInstance)
	mux.HandleFunc("DELETE /projects/{id}/instances/{iid}",              h.deleteInstance)
	mux.HandleFunc("GET /projects/{id}/instances/{iid}/basic-auth",      h.getBasicAuthHeader)

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

	// HTTP Client proxy (stateless)
	mux.HandleFunc("POST /http-client/proxy", h.proxyHTTP)

	// iFlow Scaffold
	mux.HandleFunc("POST /scaffold/generate",  h.scaffoldGenerate)
	mux.HandleFunc("POST /scaffold/preflight", h.scaffoldPreflight)
	mux.HandleFunc("POST /scaffold/upload",    h.scaffoldUpload)

	// SFTP Server — config
	mux.HandleFunc("GET /sftp-server",            h.getSFTPServer)
	mux.HandleFunc("GET /sftp-server/config",     h.getSFTPConfig)
	mux.HandleFunc("PUT /sftp-server/config",     h.putSFTPConfig)
	mux.HandleFunc("POST /sftp-server/heartbeat", h.sftpHeartbeat)
	// SFTP Server — file operations
	mux.HandleFunc("GET /sftp-server/files",         h.sftpListFiles)
	mux.HandleFunc("POST /sftp-server/files",        h.sftpCreateFile)
	mux.HandleFunc("DELETE /sftp-server/files",      h.sftpDeleteEntry)
	mux.HandleFunc("GET /sftp-server/read",          h.sftpReadFile)
	mux.HandleFunc("POST /sftp-server/mkdir",        h.sftpMkdir)
	mux.HandleFunc("POST /sftp-server/upload",       h.sftpUpload)
	mux.HandleFunc("POST /sftp-server/move",         h.sftpMove)

	// Assets
	mux.HandleFunc("GET /assets",          h.listAssets)
	mux.HandleFunc("POST /assets",         h.createAsset)
	mux.HandleFunc("GET /assets/{aid}",    h.getAsset)
	mux.HandleFunc("PUT /assets/{aid}",    h.updateAsset)
	mux.HandleFunc("DELETE /assets/{aid}", h.deleteAsset)

	// Cloud Connector
	mux.HandleFunc("GET /cloud-connector/status", h.cloudConnectorStatus)

	// EDI tools (stateless)
	mux.HandleFunc("POST /edi/parse",           h.ediParse)
	mux.HandleFunc("POST /edi/to-xml",          h.ediToXML)
	mux.HandleFunc("POST /edi/to-semantic-xml", h.ediToSemanticXML)
	mux.HandleFunc("POST /edi/from-xml",        h.ediFromXML)
	mux.HandleFunc("POST /edi/generate",        h.ediGenerate)

	// Test packs
	mux.HandleFunc("GET /test-packs",                          h.listTestPacks)
	mux.HandleFunc("POST /test-packs",                         h.createTestPack)
	mux.HandleFunc("GET /test-packs/{pid}",                    h.getTestPack)
	mux.HandleFunc("PUT /test-packs/{pid}",                    h.updateTestPack)
	mux.HandleFunc("DELETE /test-packs/{pid}",                 h.deleteTestPack)
	mux.HandleFunc("POST /test-packs/{pid}/cases",             h.createTestCase)
	mux.HandleFunc("PUT /test-packs/{pid}/cases/{cid}",        h.updateTestCase)
	mux.HandleFunc("DELETE /test-packs/{pid}/cases/{cid}",     h.deleteTestCase)
	mux.HandleFunc("POST /test-packs/{pid}/run",               h.runTestPack)
	mux.HandleFunc("POST /volume-runner/run",                  h.runVolume)

	// Mock server management (authenticated — via /api/v2/)
	mux.HandleFunc("GET /mock-endpoints",             h.listMockEndpoints)
	mux.HandleFunc("POST /mock-endpoints",            h.createMockEndpoint)
	mux.HandleFunc("PUT /mock-endpoints/{id}",        h.updateMockEndpoint)
	mux.HandleFunc("DELETE /mock-endpoints/{id}",     h.deleteMockEndpoint)
	mux.HandleFunc("POST /mock-endpoints/reset-hits", h.resetMockEndpointHits)
	mux.HandleFunc("GET /mock-requests",              h.listMockRequests)
	mux.HandleFunc("DELETE /mock-requests",           h.clearMockRequests)
	mux.HandleFunc("GET /mock-server/info",           h.mockServerInfo)
	mux.HandleFunc("GET /mock-server/cert",           h.getMockCert)
	mux.HandleFunc("POST /mock-server/cert",          h.setMockCert)

	// Scheduler
	mux.HandleFunc("GET /scheduled-jobs",                      h.listScheduledJobs)
	mux.HandleFunc("POST /scheduled-jobs",                     h.createScheduledJob)
	mux.HandleFunc("PUT /scheduled-jobs/{id}",                 h.updateScheduledJob)
	mux.HandleFunc("DELETE /scheduled-jobs/{id}",              h.deleteScheduledJob)
	mux.HandleFunc("POST /scheduled-jobs/{id}/trigger",        h.triggerScheduledJob)
	mux.HandleFunc("GET /scheduled-jobs/status",               h.schedulerStatus)

	// XSD generator (stateless)
	mux.HandleFunc("POST /xsd/generate", h.xsdGenerate)

	// Test data generator
	mux.HandleFunc("POST /testdata/analyse",          h.testdataAnalyse)
	mux.HandleFunc("POST /testdata/csv-template",     h.testdataCSVTemplate)
	mux.HandleFunc("POST /testdata/generate",         h.testdataGenerate)
	mux.HandleFunc("POST /testdata/generate-one",     h.testdataGenerateOne)
	mux.HandleFunc("POST /testdata/generate-batch",   h.testdataGenerateBatch)
	mux.HandleFunc("GET /testdata/lookup-tables",     h.listLookupTables)
	mux.HandleFunc("POST /testdata/lookup-tables",    h.createLookupTable)
	mux.HandleFunc("PUT /testdata/lookup-tables/{lid}",    h.updateLookupTable)
	mux.HandleFunc("DELETE /testdata/lookup-tables/{lid}", h.deleteLookupTable)
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
