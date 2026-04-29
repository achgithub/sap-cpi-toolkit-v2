package api

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/crypto"
)

// ── Types ──────────────────────────────────────────────────────────────────────

type ScaffoldRequest struct {
	InstanceID      string `json:"instance_id"`
	Name            string `json:"name"`
	IFlowID         string `json:"iflow_id"`
	PackageName     string `json:"package_name"`
	PackageID       string `json:"package_id"`
	Description     string `json:"description"`
	SenderAdapter   string `json:"sender_adapter"`   // HTTPS | SFTP
	ReceiverAdapter string `json:"receiver_adapter"` // HTTP | SFTP
	IncludeGroovy   bool   `json:"include_groovy"`
	GroovyName      string `json:"groovy_name"`
	GroovyContent   string `json:"groovy_content"` // if set, embedded instead of stub
	IncludeXSLT     bool   `json:"include_xslt"`
	XSLTName        string `json:"xslt_name"`
	XSLTContent     string `json:"xslt_content"` // if set, embedded instead of stub
	// Adapter properties
	HTTPSUrlPath              string `json:"https_url_path"`
	SFTPSenderHost            string `json:"sftp_sender_host"`
	SFTPSenderCredential      string `json:"sftp_sender_credential"`
	SFTPSenderDirectory       string `json:"sftp_sender_directory"`
	SFTPSenderScheduleType    string `json:"sftp_sender_schedule_type"`
	SFTPSenderScheduleValue   string `json:"sftp_sender_schedule_value"`
	HTTPReceiverURL           string `json:"http_receiver_url"`
	HTTPReceiverCredential    string `json:"http_receiver_credential"`
	SFTPReceiverHost          string `json:"sftp_receiver_host"`
	SFTPReceiverPrivateKey    string `json:"sftp_receiver_private_key"`
	SFTPReceiverUsername      string `json:"sftp_receiver_username"`
	SFTPReceiverDirectory     string `json:"sftp_receiver_directory"`
}

var scaffoldAllowedTypes = map[string]bool{"TRL": true, "SBX": true, "DEV": true}

// ── instance helper ────────────────────────────────────────────────────────────

type scaffoldInstance struct {
	URL            string
	TokenURL       string
	ClientID       string
	ClientSecret   string // plaintext
	SystemType     string
}

func (h *Handler) loadScaffoldInstance(ctx context.Context, instanceID string) (*scaffoldInstance, error) {
	var inst scaffoldInstance
	var secretEnc string
	err := h.pool.QueryRow(ctx,
		`SELECT url, token_url, client_id, client_secret_enc, system_type
		 FROM instances WHERE id = $1`, instanceID,
	).Scan(&inst.URL, &inst.TokenURL, &inst.ClientID, &secretEnc, &inst.SystemType)
	if err != nil {
		return nil, err
	}
	plain, err := crypto.Decrypt(h.encKey, secretEnc)
	if err != nil {
		return nil, fmt.Errorf("decrypt secret: %w", err)
	}
	inst.ClientSecret = plain
	return &inst, nil
}

// ── OAuth ──────────────────────────────────────────────────────────────────────

func scaffoldOAuthToken(ctx context.Context, tokenURL, clientID, clientSecret string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", tokenURL,
		strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString(
		[]byte(clientID+":"+clientSecret)))

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()
	var tok struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("no access_token in response (error: %s)", tok.Error)
	}
	return tok.AccessToken, nil
}

// ── Handlers ───────────────────────────────────────────────────────────────────

func (h *Handler) scaffoldGenerate(w http.ResponseWriter, r *http.Request) {
	var req ScaffoldRequest
	if err := decode(r, &req); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if req.Name == "" || req.IFlowID == "" {
		apiError(w, 400, "name and iflow_id are required")
		return
	}
	if !isValidCPIName(req.IFlowID) {
		apiError(w, 400, "iflow_id must start with a letter or underscore and contain only letters, digits, spaces, periods, hyphens, or underscores — must not end with a period")
		return
	}

	inst, err := h.loadScaffoldInstance(r.Context(), req.InstanceID)
	if isNotFound(err) {
		apiError(w, 404, "instance not found")
		return
	}
	if err != nil {
		h.log.Error("scaffold: load instance", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if !scaffoldAllowedTypes[inst.SystemType] {
		apiError(w, 403, fmt.Sprintf("iFlow Scaffold is not permitted for %s environments — restricted to TRL, SBX, DEV only", inst.SystemType))
		return
	}

	zipBytes, err := generateScaffoldZIP(req)
	if err != nil {
		h.log.Error("scaffold: generate zip", "error", err)
		apiError(w, 500, "generation failed: "+err.Error())
		return
	}

	filename := req.IFlowID + ".zip"
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(zipBytes)))
	w.WriteHeader(200)
	w.Write(zipBytes) //nolint:errcheck
}

func (h *Handler) scaffoldPreflight(w http.ResponseWriter, r *http.Request) {
	var req ScaffoldRequest
	if err := decode(r, &req); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}

	inst, err := h.loadScaffoldInstance(r.Context(), req.InstanceID)
	if isNotFound(err) {
		apiError(w, 404, "instance not found")
		return
	}
	if err != nil {
		h.log.Error("scaffold preflight: load instance", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if !scaffoldAllowedTypes[inst.SystemType] {
		apiError(w, 403, fmt.Sprintf("not permitted for %s", inst.SystemType))
		return
	}

	token, err := scaffoldOAuthToken(r.Context(), inst.TokenURL, inst.ClientID, inst.ClientSecret)
	if err != nil {
		apiError(w, 502, "OAuth error: "+err.Error())
		return
	}

	apiBase := strings.TrimRight(inst.URL, "/")
	client := &http.Client{Timeout: 15 * time.Second}

	pkgReq, _ := http.NewRequestWithContext(r.Context(), http.MethodGet,
		fmt.Sprintf("%s/api/v1/IntegrationPackages('%s')?$format=json", apiBase, req.PackageID), nil)
	pkgReq.Header.Set("Authorization", "Bearer "+token)
	pkgReq.Header.Set("Accept", "application/json")
	pkgResp, err := client.Do(pkgReq)
	if err != nil {
		apiError(w, 502, "package check failed: "+err.Error())
		return
	}
	pkgResp.Body.Close()

	iflowReq, _ := http.NewRequestWithContext(r.Context(), http.MethodGet,
		fmt.Sprintf("%s/api/v1/IntegrationDesigntimeArtifacts(Id='%s',Version='active')?$format=json", apiBase, req.IFlowID), nil)
	iflowReq.Header.Set("Authorization", "Bearer "+token)
	iflowReq.Header.Set("Accept", "application/json")
	iflowResp, err := client.Do(iflowReq)
	if err != nil {
		apiError(w, 502, "iflow check failed: "+err.Error())
		return
	}
	iflowResp.Body.Close()

	jsonResp(w, 200, map[string]any{
		"package_id":     req.PackageID,
		"package_exists": pkgResp.StatusCode == 200,
		"iflow_id":       req.IFlowID,
		"iflow_exists":   iflowResp.StatusCode == 200,
	})
}

func (h *Handler) scaffoldUpload(w http.ResponseWriter, r *http.Request) {
	var req ScaffoldRequest
	if err := decode(r, &req); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if req.Name == "" || req.IFlowID == "" || req.PackageID == "" {
		apiError(w, 400, "name, iflow_id, and package_id are required")
		return
	}
	if !isValidCPIName(req.IFlowID) || !isValidCPIName(req.PackageID) {
		apiError(w, 400, "invalid iflow_id or package_id format")
		return
	}

	inst, err := h.loadScaffoldInstance(r.Context(), req.InstanceID)
	if isNotFound(err) {
		apiError(w, 404, "instance not found")
		return
	}
	if err != nil {
		h.log.Error("scaffold upload: load instance", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if !scaffoldAllowedTypes[inst.SystemType] {
		apiError(w, 403, fmt.Sprintf("upload not permitted for %s environment", inst.SystemType))
		return
	}

	token, err := scaffoldOAuthToken(r.Context(), inst.TokenURL, inst.ClientID, inst.ClientSecret)
	if err != nil {
		apiError(w, 502, "OAuth error: "+err.Error())
		return
	}

	apiBase := strings.TrimRight(inst.URL, "/")

	csrfToken, err := scaffoldFetchCSRF(r.Context(), apiBase, token)
	if err != nil {
		apiError(w, 502, "CSRF error: "+err.Error())
		return
	}

	zipBytes, err := generateScaffoldZIP(req)
	if err != nil {
		apiError(w, 500, "generation failed: "+err.Error())
		return
	}

	if err := scaffoldEnsurePackage(r.Context(), apiBase, token, csrfToken, req.PackageID, req.PackageName); err != nil {
		apiError(w, 502, "package error: "+err.Error())
		return
	}

	client := &http.Client{Timeout: 60 * time.Second}
	action, err := scaffoldUpsertArtifact(r.Context(), client, apiBase, token, csrfToken, req, base64.StdEncoding.EncodeToString(zipBytes))
	if err != nil {
		apiError(w, 502, err.Error())
		return
	}

	h.log.Info("scaffold uploaded", "iflow", req.IFlowID, "action", action, "user", userID(r))
	jsonResp(w, 200, map[string]string{
		"message":  fmt.Sprintf("iFlow '%s' %s in package '%s'", req.IFlowID, action, req.PackageID),
		"iflow_id": req.IFlowID,
	})
}

// ── CPI API helpers ────────────────────────────────────────────────────────────

func scaffoldFetchCSRF(ctx context.Context, apiBase, token string) (string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		apiBase+"/api/v1/IntegrationPackages?$top=1&$format=json", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-CSRF-Token", "Fetch")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	resp.Body.Close()
	csrf := resp.Header.Get("X-CSRF-Token")
	if csrf == "" || csrf == "Required" {
		return "", fmt.Errorf("no X-CSRF-Token returned")
	}
	return csrf, nil
}

func scaffoldEnsurePackage(ctx context.Context, apiBase, token, csrfToken, pkgID, pkgName string) error {
	client := &http.Client{Timeout: 15 * time.Second}
	chk, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/api/v1/IntegrationPackages('%s')", apiBase, pkgID), nil)
	chk.Header.Set("Authorization", "Bearer "+token)
	chk.Header.Set("Accept", "application/json")
	resp, err := client.Do(chk)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode == 200 {
		return nil
	}

	name := pkgName
	if name == "" {
		name = pkgID
	}
	body, _ := json.Marshal(map[string]string{
		"Id": pkgID, "Name": name, "ShortText": name,
		"Version": "1.0.0", "SupportedPlatform": "SAP Cloud Integration",
	})
	cr, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		apiBase+"/api/v1/IntegrationPackages", bytes.NewReader(body))
	cr.Header.Set("Authorization", "Bearer "+token)
	cr.Header.Set("Content-Type", "application/json")
	cr.Header.Set("Accept", "application/json")
	cr.Header.Set("X-CSRF-Token", csrfToken)
	cResp, err := client.Do(cr)
	if err != nil {
		return err
	}
	defer cResp.Body.Close()
	if cResp.StatusCode != 201 && cResp.StatusCode != 200 {
		rb, _ := io.ReadAll(cResp.Body)
		return fmt.Errorf("create package returned %d: %s", cResp.StatusCode, string(rb))
	}
	return nil
}

func scaffoldUpsertArtifact(ctx context.Context, client *http.Client, apiBase, token, csrfToken string, req ScaffoldRequest, b64zip string) (string, error) {
	checkURL := fmt.Sprintf("%s/api/v1/IntegrationDesigntimeArtifacts(Id='%s',Version='active')", apiBase, req.IFlowID)
	chk, _ := http.NewRequestWithContext(ctx, http.MethodGet, checkURL, nil)
	chk.Header.Set("Authorization", "Bearer "+token)
	chk.Header.Set("Accept", "application/json")
	chkResp, err := client.Do(chk)
	if err != nil {
		return "", fmt.Errorf("existence check: %w", err)
	}
	chkResp.Body.Close()
	exists := chkResp.StatusCode == 200

	if exists {
		body, _ := json.Marshal(map[string]string{
			"Name": req.Name, "PackageId": req.PackageID,
			"Description": req.Description, "ArtifactContent": b64zip,
		})
		putURL := fmt.Sprintf("%s/api/v1/IntegrationDesigntimeArtifacts(Id='%s',Version='active')", apiBase, req.IFlowID)
		pr, _ := http.NewRequestWithContext(ctx, http.MethodPut, putURL, bytes.NewReader(body))
		pr.Header.Set("Authorization", "Bearer "+token)
		pr.Header.Set("Content-Type", "application/json")
		pr.Header.Set("Accept", "application/json")
		pr.Header.Set("X-CSRF-Token", csrfToken)
		pResp, err := client.Do(pr)
		if err != nil {
			return "", fmt.Errorf("update: %w", err)
		}
		defer pResp.Body.Close()
		if pResp.StatusCode != 200 && pResp.StatusCode != 202 && pResp.StatusCode != 204 {
			rb, _ := io.ReadAll(pResp.Body)
			return "", fmt.Errorf("CPI update returned %d: %s", pResp.StatusCode, string(rb))
		}
		return "updated", nil
	}

	body, _ := json.Marshal(map[string]string{
		"Id": req.IFlowID, "Name": req.Name, "PackageId": req.PackageID,
		"Description": req.Description, "ArtifactContent": b64zip,
	})
	po, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		apiBase+"/api/v1/IntegrationDesigntimeArtifacts", bytes.NewReader(body))
	po.Header.Set("Authorization", "Bearer "+token)
	po.Header.Set("Content-Type", "application/json")
	po.Header.Set("Accept", "application/json")
	po.Header.Set("X-CSRF-Token", csrfToken)
	poResp, err := client.Do(po)
	if err != nil {
		return "", fmt.Errorf("create: %w", err)
	}
	defer poResp.Body.Close()
	if poResp.StatusCode != 201 && poResp.StatusCode != 200 {
		rb, _ := io.ReadAll(poResp.Body)
		return "", fmt.Errorf("CPI create returned %d: %s", poResp.StatusCode, string(rb))
	}
	return "created", nil
}

// ── ZIP builder ────────────────────────────────────────────────────────────────

func generateScaffoldZIP(req ScaffoldRequest) ([]byte, error) {
	groovyName := req.GroovyName
	if groovyName == "" {
		groovyName = "script"
	}
	xsltName := req.XSLTName
	if xsltName == "" {
		xsltName = "mapping"
	}
	safeIFlowName := scaffoldSanitizeFilename(req.Name)

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	files := map[string]string{
		"META-INF/MANIFEST.MF": fmt.Sprintf(
			"Manifest-Version: 1.0\nBundle-ManifestVersion: 2\nBundle-Name: %s\nBundle-SymbolicName: %s;singleton:=true\nOrigin-Bundle-SymbolicName: %s\nBundle-Version: 1.0.0\nOrigin-Bundle-Version: 1.0.0\nOrigin-Bundle-Name: %s\nSAP-BundleType: IntegrationFlow\nSAP-NodeType: IFLMAP\nSAP-RuntimeProfile: iflmap\nSAP_MANIFEST_NAME: %s\n\n",
			req.Name, req.IFlowID, req.IFlowID, req.Name, req.Name,
		),
		"metainfo.prop": fmt.Sprintf(
			"#Store metainfo properties\n#%s\ndescription=%s\n",
			time.Now().UTC().Format("Mon Jan 02 15:04:05 UTC 2006"), req.Description,
		),
	}

	if req.IncludeGroovy {
		content := req.GroovyContent
		if content == "" {
			content = scaffoldGroovyStub(groovyName)
		}
		files["src/main/resources/script/"+groovyName+".groovy"] = content
	}
	if req.IncludeXSLT {
		content := req.XSLTContent
		if content == "" {
			content = scaffoldXSLTStub()
		}
		files["src/main/resources/mapping/"+xsltName+".xsl"] = content
	}

	files["src/main/resources/scenarioflows/integrationflow/"+safeIFlowName+".iflw"] =
		generateIFlowXML(req, groovyName, xsltName)

	for path, content := range files {
		f, err := zw.Create(path)
		if err != nil {
			return nil, err
		}
		if _, err := f.Write([]byte(content)); err != nil {
			return nil, err
		}
	}
	return buf.Bytes(), zw.Close()
}

// ── Stubs ──────────────────────────────────────────────────────────────────────

func scaffoldGroovyStub(name string) string {
	return fmt.Sprintf(`import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    // TODO: implement %s logic
    def headers = message.getHeaders()
    return message
}
`, name)
}

func scaffoldXSLTStub() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="xml" indent="yes" encoding="UTF-8"/>
    <!-- TODO: implement field mapping -->
    <xsl:template match="/">
        <root>
            <!-- map source fields here -->
        </root>
    </xsl:template>
</xsl:stylesheet>
`
}

// ── Adapter schedule XML ───────────────────────────────────────────────────────

func buildSFTPScheduleXML(scheduleType, scheduleValue string) string {
	const tz = "( UTC +00:00 ) UTC(UTC)"
	const tzID = "UTC"

	var rows string
	switch scheduleType {
	case "every_minutes":
		n, _ := strconv.Atoi(scheduleValue)
		if n <= 0 {
			n = 30
		}
		rows = fmt.Sprintf(
			"<row><cell>dateType</cell><cell>DAILY</cell></row>"+
				"<row><cell>timeType</cell><cell>TIME_INTERVAL</cell></row>"+
				"<row><cell>triggerType</cell><cell>cron</cell></row>"+
				"<row><cell>throwExceptionOnExpiry</cell><cell>true</cell></row>"+
				"<row><cell>timeZone</cell><cell>%s</cell></row>"+
				"<row><cell>noOfSchedules</cell><cell>1</cell></row>"+
				"<row><cell>schedule1</cell><cell>0+0/%d+*+?+*+*+*&trigger.timeZone=%s</cell></row>",
			tz, n, tzID)
	case "daily":
		parts := strings.SplitN(scheduleValue, ":", 2)
		hh, mm := "08", "00"
		if len(parts) == 2 {
			hh, mm = parts[0], parts[1]
		}
		rows = fmt.Sprintf(
			"<row><cell>dateType</cell><cell>DAILY</cell></row>"+
				"<row><cell>timeType</cell><cell>TIME_DAY</cell></row>"+
				"<row><cell>startTime</cell><cell>%s:%s:00</cell></row>"+
				"<row><cell>triggerType</cell><cell>cron</cell></row>"+
				"<row><cell>throwExceptionOnExpiry</cell><cell>true</cell></row>"+
				"<row><cell>timeZone</cell><cell>%s</cell></row>"+
				"<row><cell>noOfSchedules</cell><cell>1</cell></row>"+
				"<row><cell>schedule1</cell><cell>0+%s+%s+?+*+*+*&trigger.timeZone=%s</cell></row>",
			hh, mm, tz, mm, hh, tzID)
	default: // every_hours
		n, _ := strconv.Atoi(scheduleValue)
		if n <= 0 {
			n = 1
		}
		rows = fmt.Sprintf(
			"<row><cell>dateType</cell><cell>DAILY</cell></row>"+
				"<row><cell>timeType</cell><cell>TIME_HOUR_INTERVAL</cell></row>"+
				"<row><cell>OnEveryHour</cell><cell>%d</cell></row>"+
				"<row><cell>triggerType</cell><cell>cron</cell></row>"+
				"<row><cell>throwExceptionOnExpiry</cell><cell>true</cell></row>"+
				"<row><cell>timeZone</key><cell>%s</cell></row>"+
				"<row><cell>noOfSchedules</cell><cell>1</cell></row>"+
				"<row><cell>schedule1</cell><cell>0+0+0/%d+?+*+*+*&trigger.timeZone=%s</cell></row>",
			n, tz, n, tzID)
	}

	rows = strings.ReplaceAll(rows, "&", "&amp;amp;")
	rows = strings.ReplaceAll(rows, "<", "&lt;")
	rows = strings.ReplaceAll(rows, ">", "&gt;")
	return rows
}

// ── Validation / util ──────────────────────────────────────────────────────────

func isValidCPIName(s string) bool {
	if s == "" {
		return false
	}
	first := rune(s[0])
	if !unicode.IsLetter(first) && first != '_' {
		return false
	}
	if s[len(s)-1] == '.' {
		return false
	}
	for _, r := range s {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != ' ' && r != '.' && r != '-' && r != '_' {
			return false
		}
	}
	return true
}

func scaffoldSanitizeFilename(name string) string {
	var b strings.Builder
	for _, r := range name {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			b.WriteRune(r)
		} else if r == ' ' {
			b.WriteRune('_')
		}
	}
	return b.String()
}

func zzDefault(val, fallback string) string {
	if strings.TrimSpace(val) == "" {
		return fallback
	}
	return val
}

func scaffoldIndexOf(slice []string, val string) int {
	for i, v := range slice {
		if v == val {
			return i
		}
	}
	return -1
}
