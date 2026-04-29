package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type MockEndpoint struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Method          string            `json:"method"` // GET | POST | PUT | DELETE | PATCH | * (any)
	PathPattern     string            `json:"path_pattern"`
	ResponseStatus  int               `json:"response_status"`
	ResponseHeaders map[string]string `json:"response_headers"`
	ResponseBody    string            `json:"response_body"`
	LatencyMs       int               `json:"latency_ms"`
	Enabled         bool              `json:"enabled"`
	HitCount        int               `json:"hit_count"`
	CreatedAt       time.Time         `json:"created_at"`
}

type MockRequest struct {
	ID             string    `json:"id"`
	EndpointID     *string   `json:"endpoint_id"`
	Method         string    `json:"method"`
	Path           string    `json:"path"`
	RequestHeaders map[string]string `json:"request_headers"`
	RequestBody    string    `json:"request_body"`
	ResponseStatus int       `json:"response_status"`
	Matched        bool      `json:"matched"`
	ReceivedAt     time.Time `json:"received_at"`
}

// ── Path matching ─────────────────────────────────────────────────────────────

// matchPath returns true if path matches pattern.
// Pattern segments wrapped in {} match any single segment.
// A trailing /* matches any remaining path.
func matchPath(pattern, path string) bool {
	pattern = strings.Trim(pattern, "/")
	path = strings.Trim(path, "/")

	if strings.HasSuffix(pattern, "/*") {
		prefix := strings.TrimSuffix(pattern, "/*")
		return strings.HasPrefix(path, prefix)
	}

	pp := strings.Split(pattern, "/")
	ps := strings.Split(path, "/")
	if len(pp) != len(ps) {
		return false
	}
	for i, seg := range pp {
		if strings.HasPrefix(seg, "{") && strings.HasSuffix(seg, "}") {
			continue // wildcard segment
		}
		if seg != ps[i] {
			return false
		}
	}
	return true
}

// ── Public receiver ───────────────────────────────────────────────────────────

func (h *Handler) mockReceive(w http.ResponseWriter, r *http.Request) {
	// Strip the /mock/ prefix to get the user-facing path
	path := strings.TrimPrefix(r.URL.Path, "/mock")
	if path == "" {
		path = "/"
	}

	bodyBytes, _ := io.ReadAll(io.LimitReader(r.Body, 64*1024))
	reqBody := string(bodyBytes)

	// Collect request headers (skip internal ones)
	reqHdrs := map[string]string{}
	for k, vals := range r.Header {
		if k == "Authorization" || k == "Cookie" {
			continue
		}
		reqHdrs[k] = vals[0]
	}

	// Load enabled endpoints
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, name, method, path_pattern, response_status, response_headers,
		       response_body, latency_ms, enabled, hit_count, created_at
		FROM mock_endpoints WHERE enabled = true ORDER BY created_at ASC`)
	if err != nil {
		http.Error(w, "mock server error", 500)
		return
	}
	defer rows.Close()

	var endpoints []MockEndpoint
	for rows.Next() {
		var ep MockEndpoint
		var hdrBytes []byte
		if err := rows.Scan(&ep.ID, &ep.Name, &ep.Method, &ep.PathPattern,
			&ep.ResponseStatus, &hdrBytes, &ep.ResponseBody,
			&ep.LatencyMs, &ep.Enabled, &ep.HitCount, &ep.CreatedAt); err == nil {
			json.Unmarshal(hdrBytes, &ep.ResponseHeaders) //nolint:errcheck
			endpoints = append(endpoints, ep)
		}
	}
	rows.Close()

	// Find first matching endpoint
	var matched *MockEndpoint
	for i := range endpoints {
		ep := &endpoints[i]
		methodMatch := ep.Method == "*" || strings.EqualFold(ep.Method, r.Method)
		if methodMatch && matchPath(ep.PathPattern, path) {
			matched = ep
			break
		}
	}

	status := 404
	respBody := `{"error":"no mock endpoint matched"}`
	var endpointID *string

	if matched != nil {
		status = matched.ResponseStatus
		respBody = matched.ResponseBody
		endpointID = &matched.ID

		// Apply latency
		if matched.LatencyMs > 0 {
			time.Sleep(time.Duration(matched.LatencyMs) * time.Millisecond)
		}

		// Write configured headers
		for k, v := range matched.ResponseHeaders {
			w.Header().Set(k, v)
		}
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", "application/json")
		}

		// Increment hit count (fire-and-forget)
		go h.pool.Exec(r.Context(), //nolint:errcheck
			`UPDATE mock_endpoints SET hit_count = hit_count + 1 WHERE id = $1`, matched.ID)
	} else {
		w.Header().Set("Content-Type", "application/json")
	}

	w.WriteHeader(status)
	w.Write([]byte(respBody)) //nolint:errcheck

	// Log the request asynchronously
	reqHdrBytes, _ := json.Marshal(reqHdrs)
	go h.pool.Exec(r.Context(), `
		INSERT INTO mock_requests
		  (endpoint_id, method, path, request_headers, request_body, response_status, matched)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		endpointID, r.Method, path, reqHdrBytes, reqBody, status, matched != nil)
}

// MockMux returns an http.Handler for the dedicated TLS listener — only /mock/ routes.
func (h *Handler) MockMux() *http.ServeMux {
	m := http.NewServeMux()
	m.HandleFunc("/mock/", h.mockReceive)
	return m
}

func (h *Handler) mockServerInfo(w http.ResponseWriter, r *http.Request) {
	type infoResp struct {
		TLSPort  string   `json:"tls_port"`
		CertPEM  string   `json:"cert_pem"`
		CertInfo CertInfo `json:"cert_info"`
	}
	resp := infoResp{TLSPort: h.mockTLSPort}
	if h.certHolder != nil {
		resp.CertPEM = string(h.certHolder.CertPEM())
		resp.CertInfo = h.certHolder.Info()
	}
	jsonResp(w, 200, resp)
}

func (h *Handler) getMockCert(w http.ResponseWriter, r *http.Request) {
	// Returns current mode + cert PEM (never returns key PEM).
	mode := "auto"
	row := h.pool.QueryRow(r.Context(),
		`SELECT value FROM mock_server_config WHERE key = 'cert_mode'`)
	row.Scan(&mode) //nolint:errcheck

	type certResp struct {
		Mode     string   `json:"mode"`
		CertPEM  string   `json:"cert_pem"`
		CertInfo CertInfo `json:"cert_info"`
	}
	resp := certResp{Mode: mode}
	if h.certHolder != nil {
		resp.CertPEM = string(h.certHolder.CertPEM())
		resp.CertInfo = h.certHolder.Info()
	}
	jsonResp(w, 200, resp)
}

func (h *Handler) setMockCert(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Mode    string `json:"mode"`     // "auto" | "custom"
		CertPEM string `json:"cert_pem"` // required when mode=custom
		KeyPEM  string `json:"key_pem"`  // required when mode=custom
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}

	if body.Mode == "custom" {
		if body.CertPEM == "" || body.KeyPEM == "" {
			apiError(w, 400, "cert_pem and key_pem are required for custom mode")
			return
		}
		bundle, err := ParseCustomCert([]byte(body.CertPEM), []byte(body.KeyPEM))
		if err != nil {
			apiError(w, 422, err.Error())
			return
		}
		// Persist cert + key (key stored in DB; acceptable for local dev,
		// should use vault/secret in production).
		upsertConfig := func(key, val string) {
			h.pool.Exec(r.Context(), `
				INSERT INTO mock_server_config (key, value) VALUES ($1,$2)
				ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, val) //nolint:errcheck
		}
		upsertConfig("cert_mode", "custom")
		upsertConfig("custom_cert_pem", body.CertPEM)
		upsertConfig("custom_key_pem", body.KeyPEM)

		if h.certHolder != nil {
			h.certHolder.Set(bundle)
		}
		jsonResp(w, 200, map[string]any{"mode": "custom", "cert_info": bundle.Info})
		return
	}

	// Revert to auto-generated cert.
	h.pool.Exec(r.Context(), `
		INSERT INTO mock_server_config (key, value) VALUES ('cert_mode','auto')
		ON CONFLICT (key) DO UPDATE SET value = 'auto'`) //nolint:errcheck
	// Regenerate so the response reflects the current cert.
	if h.certHolder != nil {
		bundle, err := GenerateSelfSignedCert("localhost", "127.0.0.1", "api")
		if err == nil {
			h.certHolder.Set(bundle)
		}
	}
	info := CertInfo{}
	if h.certHolder != nil {
		info = h.certHolder.Info()
	}
	jsonResp(w, 200, map[string]any{"mode": "auto", "cert_info": info})
}

// ── Endpoint CRUD ─────────────────────────────────────────────────────────────

func (h *Handler) listMockEndpoints(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, name, method, path_pattern, response_status, response_headers,
		       response_body, latency_ms, enabled, hit_count, created_at
		FROM mock_endpoints ORDER BY created_at ASC`)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	eps := []MockEndpoint{}
	for rows.Next() {
		var ep MockEndpoint
		var hdrBytes []byte
		if err := rows.Scan(&ep.ID, &ep.Name, &ep.Method, &ep.PathPattern,
			&ep.ResponseStatus, &hdrBytes, &ep.ResponseBody,
			&ep.LatencyMs, &ep.Enabled, &ep.HitCount, &ep.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal(hdrBytes, &ep.ResponseHeaders) //nolint:errcheck
		eps = append(eps, ep)
	}
	jsonResp(w, 200, eps)
}

func (h *Handler) createMockEndpoint(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name            string            `json:"name"`
		Method          string            `json:"method"`
		PathPattern     string            `json:"path_pattern"`
		ResponseStatus  int               `json:"response_status"`
		ResponseHeaders map[string]string `json:"response_headers"`
		ResponseBody    string            `json:"response_body"`
		LatencyMs       int               `json:"latency_ms"`
		Enabled         bool              `json:"enabled"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.Method == "" {
		body.Method = "*"
	}
	if body.PathPattern == "" || !strings.HasPrefix(body.PathPattern, "/") {
		apiError(w, 400, "path_pattern must start with /")
		return
	}
	if body.ResponseStatus == 0 {
		body.ResponseStatus = 200
	}
	if body.ResponseHeaders == nil {
		body.ResponseHeaders = map[string]string{}
	}
	hdrBytes, _ := json.Marshal(body.ResponseHeaders)

	var ep MockEndpoint
	var hdrOut []byte
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO mock_endpoints
		  (name, method, path_pattern, response_status, response_headers,
		   response_body, latency_ms, enabled)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, name, method, path_pattern, response_status, response_headers,
		          response_body, latency_ms, enabled, hit_count, created_at`,
		body.Name, body.Method, body.PathPattern, body.ResponseStatus, hdrBytes,
		body.ResponseBody, body.LatencyMs, body.Enabled,
	).Scan(&ep.ID, &ep.Name, &ep.Method, &ep.PathPattern,
		&ep.ResponseStatus, &hdrOut, &ep.ResponseBody,
		&ep.LatencyMs, &ep.Enabled, &ep.HitCount, &ep.CreatedAt)
	if err != nil {
		h.log.Error("create mock endpoint", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	json.Unmarshal(hdrOut, &ep.ResponseHeaders) //nolint:errcheck
	jsonResp(w, 201, ep)
}

func (h *Handler) updateMockEndpoint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Name            string            `json:"name"`
		Method          string            `json:"method"`
		PathPattern     string            `json:"path_pattern"`
		ResponseStatus  int               `json:"response_status"`
		ResponseHeaders map[string]string `json:"response_headers"`
		ResponseBody    string            `json:"response_body"`
		LatencyMs       int               `json:"latency_ms"`
		Enabled         bool              `json:"enabled"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.ResponseHeaders == nil {
		body.ResponseHeaders = map[string]string{}
	}
	hdrBytes, _ := json.Marshal(body.ResponseHeaders)

	tag, err := h.pool.Exec(r.Context(), `
		UPDATE mock_endpoints
		SET name=$2, method=$3, path_pattern=$4, response_status=$5,
		    response_headers=$6, response_body=$7, latency_ms=$8, enabled=$9
		WHERE id=$1`,
		id, body.Name, body.Method, body.PathPattern, body.ResponseStatus,
		hdrBytes, body.ResponseBody, body.LatencyMs, body.Enabled)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "endpoint not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) deleteMockEndpoint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tag, err := h.pool.Exec(r.Context(), `DELETE FROM mock_endpoints WHERE id=$1`, id)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "endpoint not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) resetMockEndpointHits(w http.ResponseWriter, r *http.Request) {
	h.pool.Exec(r.Context(), `UPDATE mock_endpoints SET hit_count = 0`) //nolint:errcheck
	w.WriteHeader(204)
}

// ── Request Log ───────────────────────────────────────────────────────────────

func (h *Handler) listMockRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, endpoint_id::text, method, path, request_headers, request_body,
		       response_status, matched, received_at
		FROM mock_requests
		ORDER BY received_at DESC
		LIMIT 200`)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	reqs := []MockRequest{}
	for rows.Next() {
		var req MockRequest
		var hdrBytes []byte
		var eid *string
		if err := rows.Scan(&req.ID, &eid, &req.Method, &req.Path,
			&hdrBytes, &req.RequestBody, &req.ResponseStatus,
			&req.Matched, &req.ReceivedAt); err != nil {
			continue
		}
		req.EndpointID = eid
		json.Unmarshal(hdrBytes, &req.RequestHeaders) //nolint:errcheck
		reqs = append(reqs, req)
	}
	jsonResp(w, 200, reqs)
}

func (h *Handler) clearMockRequests(w http.ResponseWriter, r *http.Request) {
	h.pool.Exec(r.Context(), `DELETE FROM mock_requests`) //nolint:errcheck
	w.WriteHeader(204)
}
