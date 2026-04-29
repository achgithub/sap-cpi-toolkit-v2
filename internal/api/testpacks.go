package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type TestPack struct {
	ID          string    `json:"id"`
	ProjectID   *string   `json:"project_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CaseCount   int       `json:"case_count"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type TestCase struct {
	ID                   string          `json:"id"`
	PackID               string          `json:"pack_id"`
	Seq                  int             `json:"seq"`
	Name                 string          `json:"name"`
	Type                 string          `json:"type"` // "http" | "sftp"
	Method               string          `json:"method"`
	URL                  string          `json:"url"`
	Headers              json.RawMessage `json:"headers"`
	Body                 string          `json:"body"`
	ExpectedStatus       *int            `json:"expected_status"`
	ExpectedBodyContains *string         `json:"expected_body_contains"`
	SFTPSource           string          `json:"sftp_source"`
	SFTPTarget           string          `json:"sftp_target"`
	WaitSeconds          int             `json:"wait_seconds"`
	CreatedAt            time.Time       `json:"created_at"`
}

type CaseResult struct {
	CaseID        string `json:"case_id"`
	Name          string `json:"name"`
	Status        string `json:"status"` // "pass" | "fail" | "error"
	StatusCode    int    `json:"status_code"`
	DurationMs    int64  `json:"duration_ms"`
	WaitedSeconds int    `json:"waited_seconds,omitempty"`
	BodyPreview   string `json:"body_preview"`
	Error         string `json:"error,omitempty"`
}

type RunResult struct {
	PackID     string       `json:"pack_id"`
	Total      int          `json:"total"`
	Passed     int          `json:"passed"`
	Failed     int          `json:"failed"`
	DurationMs int64        `json:"duration_ms"`
	Cases      []CaseResult `json:"cases"`
}

// ── Pack CRUD ─────────────────────────────────────────────────────────────────

func (h *Handler) listTestPacks(w http.ResponseWriter, r *http.Request) {
	projectID := strings.TrimSpace(r.URL.Query().Get("project_id"))

	sql := `
		SELECT p.id, p.project_id::text, p.name, p.description,
		       COUNT(c.id)::int, p.created_by, p.created_at, p.updated_at
		FROM test_packs p
		LEFT JOIN test_cases c ON c.pack_id = p.id
		WHERE 1=1`
	args := []any{}
	if projectID != "" {
		args = append(args, projectID)
		sql += fmt.Sprintf(" AND p.project_id = $%d::uuid", len(args))
	}
	sql += " GROUP BY p.id ORDER BY p.updated_at DESC"

	rows, err := h.pool.Query(r.Context(), sql, args...)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	packs := []TestPack{}
	for rows.Next() {
		var p TestPack
		if err := rows.Scan(&p.ID, &p.ProjectID, &p.Name, &p.Description,
			&p.CaseCount, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt); err != nil {
			apiError(w, 500, "internal error")
			return
		}
		packs = append(packs, p)
	}
	jsonResp(w, 200, packs)
}

func (h *Handler) createTestPack(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProjectID   *string `json:"project_id"`
		Name        string  `json:"name"`
		Description string  `json:"description"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		apiError(w, 400, "name is required")
		return
	}
	var p TestPack
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO test_packs (project_id, name, description, created_by)
		VALUES ($1::uuid, $2, $3, $4)
		RETURNING id, project_id::text, name, description, 0, created_by, created_at, updated_at`,
		nullableUUID(body.ProjectID), body.Name, body.Description, userID(r),
	).Scan(&p.ID, &p.ProjectID, &p.Name, &p.Description,
		&p.CaseCount, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		h.log.Error("create test pack", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, p)
}

func (h *Handler) getTestPack(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")

	var p TestPack
	err := h.pool.QueryRow(r.Context(), `
		SELECT p.id, p.project_id::text, p.name, p.description,
		       COUNT(c.id)::int, p.created_by, p.created_at, p.updated_at
		FROM test_packs p
		LEFT JOIN test_cases c ON c.pack_id = p.id
		WHERE p.id = $1
		GROUP BY p.id`, pid,
	).Scan(&p.ID, &p.ProjectID, &p.Name, &p.Description,
		&p.CaseCount, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if isNotFound(err) {
		apiError(w, 404, "test pack not found")
		return
	}
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}

	cases, err := h.loadCases(r.Context(), pid)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}

	jsonResp(w, 200, map[string]any{"pack": p, "cases": cases})
}

func (h *Handler) updateTestPack(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		apiError(w, 400, "name is required")
		return
	}
	tag, err := h.pool.Exec(r.Context(), `
		UPDATE test_packs SET name=$2, description=$3, updated_at=NOW() WHERE id=$1`,
		r.PathValue("pid"), body.Name, body.Description)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "test pack not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) deleteTestPack(w http.ResponseWriter, r *http.Request) {
	tag, err := h.pool.Exec(r.Context(), `DELETE FROM test_packs WHERE id=$1`, r.PathValue("pid"))
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "test pack not found")
		return
	}
	w.WriteHeader(204)
}

// ── Case CRUD ─────────────────────────────────────────────────────────────────

func (h *Handler) loadCases(ctx context.Context, packID string) ([]TestCase, error) {
	rows, err := h.pool.Query(ctx, `
		SELECT id, pack_id, seq, name, type, method, url, headers, body,
		       expected_status, expected_body_contains, sftp_source, sftp_target, wait_seconds, created_at
		FROM test_cases WHERE pack_id=$1 ORDER BY seq, created_at`, packID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cases := []TestCase{}
	for rows.Next() {
		var c TestCase
		var hdrBytes []byte
		if err := rows.Scan(&c.ID, &c.PackID, &c.Seq, &c.Name, &c.Type, &c.Method, &c.URL,
			&hdrBytes, &c.Body, &c.ExpectedStatus, &c.ExpectedBodyContains,
			&c.SFTPSource, &c.SFTPTarget, &c.WaitSeconds, &c.CreatedAt); err != nil {
			return nil, err
		}
		if len(hdrBytes) == 0 {
			hdrBytes = []byte("{}")
		}
		c.Headers = json.RawMessage(hdrBytes)
		if c.Type == "" {
			c.Type = "http"
		}
		cases = append(cases, c)
	}
	return cases, nil
}

func (h *Handler) createTestCase(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Seq                  int             `json:"seq"`
		Name                 string          `json:"name"`
		Type                 string          `json:"type"`
		Method               string          `json:"method"`
		URL                  string          `json:"url"`
		Headers              json.RawMessage `json:"headers"`
		Body                 string          `json:"body"`
		ExpectedStatus       *int            `json:"expected_status"`
		ExpectedBodyContains *string         `json:"expected_body_contains"`
		SFTPSource           string          `json:"sftp_source"`
		SFTPTarget           string          `json:"sftp_target"`
		WaitSeconds          int             `json:"wait_seconds"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if len(body.Headers) == 0 {
		body.Headers = json.RawMessage("{}")
	}
	if body.Method == "" {
		body.Method = "GET"
	}
	if body.Type == "" {
		body.Type = "http"
	}

	var c TestCase
	var hdrBytes []byte
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO test_cases
		  (pack_id, seq, name, type, method, url, headers, body,
		   expected_status, expected_body_contains, sftp_source, sftp_target, wait_seconds)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id, pack_id, seq, name, type, method, url, headers, body,
		          expected_status, expected_body_contains, sftp_source, sftp_target, wait_seconds, created_at`,
		r.PathValue("pid"), body.Seq, body.Name, body.Type, body.Method, body.URL,
		[]byte(body.Headers), body.Body, body.ExpectedStatus, body.ExpectedBodyContains,
		body.SFTPSource, body.SFTPTarget, body.WaitSeconds,
	).Scan(&c.ID, &c.PackID, &c.Seq, &c.Name, &c.Type, &c.Method, &c.URL,
		&hdrBytes, &c.Body, &c.ExpectedStatus, &c.ExpectedBodyContains,
		&c.SFTPSource, &c.SFTPTarget, &c.WaitSeconds, &c.CreatedAt)
	if err != nil {
		h.log.Error("create test case", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if len(hdrBytes) == 0 {
		hdrBytes = []byte("{}")
	}
	c.Headers = json.RawMessage(hdrBytes)
	jsonResp(w, 201, c)
}

func (h *Handler) updateTestCase(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Seq                  int             `json:"seq"`
		Name                 string          `json:"name"`
		Type                 string          `json:"type"`
		Method               string          `json:"method"`
		URL                  string          `json:"url"`
		Headers              json.RawMessage `json:"headers"`
		Body                 string          `json:"body"`
		ExpectedStatus       *int            `json:"expected_status"`
		ExpectedBodyContains *string         `json:"expected_body_contains"`
		SFTPSource           string          `json:"sftp_source"`
		SFTPTarget           string          `json:"sftp_target"`
		WaitSeconds          int             `json:"wait_seconds"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if len(body.Headers) == 0 {
		body.Headers = json.RawMessage("{}")
	}
	if body.Type == "" {
		body.Type = "http"
	}
	tag, err := h.pool.Exec(r.Context(), `
		UPDATE test_cases
		SET seq=$3, name=$4, type=$5, method=$6, url=$7, headers=$8, body=$9,
		    expected_status=$10, expected_body_contains=$11,
		    sftp_source=$12, sftp_target=$13, wait_seconds=$14
		WHERE id=$1 AND pack_id=$2`,
		r.PathValue("cid"), r.PathValue("pid"),
		body.Seq, body.Name, body.Type, body.Method, body.URL, []byte(body.Headers), body.Body,
		body.ExpectedStatus, body.ExpectedBodyContains,
		body.SFTPSource, body.SFTPTarget, body.WaitSeconds)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "test case not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) deleteTestCase(w http.ResponseWriter, r *http.Request) {
	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM test_cases WHERE id=$1 AND pack_id=$2`,
		r.PathValue("cid"), r.PathValue("pid"))
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "test case not found")
		return
	}
	w.WriteHeader(204)
}

// ── Run ───────────────────────────────────────────────────────────────────────

func (h *Handler) runTestPack(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")

	cases, err := h.loadCases(r.Context(), pid)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	if len(cases) == 0 {
		apiError(w, 400, "pack has no test cases")
		return
	}

	// Extend write deadline to accommodate waits between cases.
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Now().Add(30 * time.Minute))

	start := time.Now()
	result := RunResult{PackID: pid, Total: len(cases)}
	client := &http.Client{Timeout: 30 * time.Second}

	for i, tc := range cases {
		var cr CaseResult
		if tc.Type == "sftp" {
			cr = h.runSFTPCase(tc)
		} else {
			cr = runCase(client, tc)
		}

		// Apply post-step wait (skip after last case)
		if tc.WaitSeconds > 0 && i < len(cases)-1 {
			cr.WaitedSeconds = tc.WaitSeconds
			time.Sleep(time.Duration(tc.WaitSeconds) * time.Second)
		}

		result.Cases = append(result.Cases, cr)
		if cr.Status == "pass" {
			result.Passed++
		} else {
			result.Failed++
		}
	}
	result.DurationMs = time.Since(start).Milliseconds()
	jsonResp(w, 200, result)
}

// runSFTPCase copies a file from sftp_source to sftp_target on the shared SFTP data volume.
// Source path is relative to SFTP_DATA_DIR (e.g. /testdata/orders/PO_001.xml).
// Target path is the deposit folder (e.g. /inbox/orders/) — file keeps its original name.
func (h *Handler) runSFTPCase(tc TestCase) CaseResult {
	cr := CaseResult{CaseID: tc.ID, Name: tc.Name}
	start := time.Now()

	if h.sftpDataDir == "" {
		cr.Status = "error"; cr.Error = "SFTP_DATA_DIR not configured"
		cr.DurationMs = time.Since(start).Milliseconds()
		return cr
	}
	if tc.SFTPSource == "" || tc.SFTPTarget == "" {
		cr.Status = "error"; cr.Error = "sftp_source and sftp_target are required"
		cr.DurationMs = time.Since(start).Milliseconds()
		return cr
	}

	srcPath := filepath.Join(h.sftpDataDir, filepath.Clean("/"+tc.SFTPSource))
	tgtDir  := filepath.Join(h.sftpDataDir, filepath.Clean("/"+tc.SFTPTarget))

	data, err := os.ReadFile(srcPath)
	if err != nil {
		cr.Status = "error"; cr.Error = fmt.Sprintf("source not found: %s", tc.SFTPSource)
		cr.DurationMs = time.Since(start).Milliseconds()
		return cr
	}

	if err := os.MkdirAll(tgtDir, 0755); err != nil {
		cr.Status = "error"; cr.Error = fmt.Sprintf("cannot create target dir: %v", err)
		cr.DurationMs = time.Since(start).Milliseconds()
		return cr
	}

	tgtPath := filepath.Join(tgtDir, filepath.Base(srcPath))
	if err := os.WriteFile(tgtPath, data, 0644); err != nil {
		cr.Status = "error"; cr.Error = fmt.Sprintf("write failed: %v", err)
		cr.DurationMs = time.Since(start).Milliseconds()
		return cr
	}

	cr.Status = "pass"
	cr.BodyPreview = fmt.Sprintf("Deposited %s → %s (%d bytes)", tc.SFTPSource, tc.SFTPTarget, len(data))
	cr.DurationMs = time.Since(start).Milliseconds()
	return cr
}

func runCase(client *http.Client, tc TestCase) CaseResult {
	cr := CaseResult{CaseID: tc.ID, Name: tc.Name}
	start := time.Now()

	// Build request
	var bodyReader io.Reader
	if tc.Body != "" {
		bodyReader = strings.NewReader(tc.Body)
	}
	req, err := http.NewRequest(tc.Method, tc.URL, bodyReader)
	if err != nil {
		cr.Status = "error"; cr.Error = err.Error()
		cr.DurationMs = time.Since(start).Milliseconds()
		return cr
	}

	// Apply headers
	var hdrs map[string]string
	if len(tc.Headers) > 0 {
		json.Unmarshal(tc.Headers, &hdrs) //nolint:errcheck
	}
	for k, v := range hdrs {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	cr.DurationMs = time.Since(start).Milliseconds()
	if err != nil {
		cr.Status = "error"; cr.Error = err.Error()
		return cr
	}
	defer resp.Body.Close()

	cr.StatusCode = resp.StatusCode
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	bodyStr := string(bodyBytes)
	if len(bodyStr) > 200 {
		cr.BodyPreview = bodyStr[:200] + "…"
	} else {
		cr.BodyPreview = bodyStr
	}

	// Evaluate assertions
	statusOK := tc.ExpectedStatus == nil || resp.StatusCode == *tc.ExpectedStatus
	if tc.ExpectedStatus == nil {
		statusOK = resp.StatusCode >= 200 && resp.StatusCode < 300
	}
	bodyOK := tc.ExpectedBodyContains == nil || strings.Contains(bodyStr, *tc.ExpectedBodyContains)

	if statusOK && bodyOK {
		cr.Status = "pass"
	} else {
		cr.Status = "fail"
		if !statusOK {
			expected := 200
			if tc.ExpectedStatus != nil {
				expected = *tc.ExpectedStatus
			}
			cr.Error = fmt.Sprintf("expected status %d, got %d", expected, resp.StatusCode)
		} else if !bodyOK {
			cr.Error = fmt.Sprintf("body does not contain %q", *tc.ExpectedBodyContains)
		}
	}
	return cr
}
