package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/sapclient"
)

// ── OData filter building ─────────────────────────────────────────────────────

var timeRanges = map[string]time.Duration{
	"Past Hour":    1 * time.Hour,
	"Past 4 Hours": 4 * time.Hour,
	"Past Day":     24 * time.Hour,
	"Past Week":    7 * 24 * time.Hour,
}

func buildMonitorFilter(timeRange, status, packageID, iFlowID, idSearch string) string {
	dur, ok := timeRanges[timeRange]
	if !ok {
		dur = time.Hour
	}
	from := time.Now().UTC().Add(-dur)
	// CPI OData v2 datetime literal — no ms, no trailing Z
	parts := []string{fmt.Sprintf("LogEnd ge datetime'%s'", from.Format("2006-01-02T15:04:05"))}

	if status != "" {
		parts = append(parts, fmt.Sprintf("Status eq '%s'", status))
	}
	if iFlowID != "" {
		parts = append(parts, fmt.Sprintf("IntegrationArtifact/Id eq '%s'", iFlowID))
	} else if packageID != "" {
		parts = append(parts, fmt.Sprintf("IntegrationArtifact/PackageId eq '%s'", packageID))
	}
	if idSearch != "" {
		parts = append(parts, fmt.Sprintf(
			"(MessageGuid eq '%s' or CorrelationId eq '%s' or ApplicationMessageId eq '%s')",
			idSearch, idSearch, idSearch,
		))
	}
	return strings.Join(parts, " and ")
}

// ── Message endpoints ─────────────────────────────────────────────────────────

func (h *Handler) listMessages(w http.ResponseWriter, r *http.Request) {
	iid := r.PathValue("iid")
	q := r.URL.Query()

	top, _ := strconv.Atoi(q.Get("top"))
	if top <= 0 || top > 200 {
		top = 50
	}
	skip, _ := strconv.Atoi(q.Get("skip"))

	filter := buildMonitorFilter(
		q.Get("time_range"),
		q.Get("status"),
		q.Get("package_id"),
		q.Get("iflow_id"),
		q.Get("id_search"),
	)

	client, err := h.sapClientForInstance(r, iid)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "instance not found")
			return
		}
		h.log.Error("get SAP client", "error", err, "instance", iid)
		apiError(w, 500, "internal error")
		return
	}

	page, err := client.ListMessagePage(r.Context(), sapclient.ListMessagesParams{
		Top: top, Skip: skip, Filter: filter,
	})
	if err != nil {
		h.log.Error("list messages", "error", err, "instance", iid)
		apiError(w, 502, err.Error())
		return
	}
	jsonResp(w, 200, page)
}

func (h *Handler) getMessage(w http.ResponseWriter, r *http.Request) {
	iid  := r.PathValue("iid")
	guid := r.PathValue("guid")

	client, err := h.sapClientForInstance(r, iid)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "instance not found")
			return
		}
		apiError(w, 500, "internal error")
		return
	}

	msg, err := client.GetMessage(r.Context(), guid)
	if err != nil {
		h.log.Error("get message", "error", err, "guid", guid)
		apiError(w, 502, err.Error())
		return
	}
	jsonResp(w, 200, msg)
}

func (h *Handler) getMessageError(w http.ResponseWriter, r *http.Request) {
	iid  := r.PathValue("iid")
	guid := r.PathValue("guid")

	client, err := h.sapClientForInstance(r, iid)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "instance not found")
			return
		}
		apiError(w, 500, "internal error")
		return
	}

	info, err := client.GetMessageErrorInfo(r.Context(), guid)
	if err != nil {
		h.log.Error("get message error info", "error", err, "guid", guid)
		apiError(w, 502, err.Error())
		return
	}
	if info == nil {
		w.WriteHeader(204)
		return
	}
	jsonResp(w, 200, info)
}

// ── Monitoring tile endpoints ─────────────────────────────────────────────────

type MonitoringTile struct {
	ID         string    `json:"id"`
	ProjectID  string    `json:"project_id"`
	InstanceID string    `json:"instance_id"`
	Name       string    `json:"name"`
	TimeRange  string    `json:"time_range"`
	Status     string    `json:"status"`
	PackageID  string    `json:"package_id"`
	IFlowID    string    `json:"iflow_id"`
	SortOrder  int       `json:"sort_order"`
	CreatedAt  time.Time `json:"created_at"`
}

func (h *Handler) listTiles(w http.ResponseWriter, r *http.Request) {
	iid := r.PathValue("iid")
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, project_id, instance_id, name, time_range, status,
		        package_id, iflow_id, sort_order, created_at
		 FROM monitoring_tiles WHERE instance_id=$1 ORDER BY sort_order, created_at`,
		iid)
	if err != nil {
		h.log.Error("list tiles", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	tiles := []MonitoringTile{}
	for rows.Next() {
		var t MonitoringTile
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.InstanceID, &t.Name, &t.TimeRange,
			&t.Status, &t.PackageID, &t.IFlowID, &t.SortOrder, &t.CreatedAt); err != nil {
			h.log.Error("scan tile", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		tiles = append(tiles, t)
	}
	jsonResp(w, 200, tiles)
}

func (h *Handler) createTile(w http.ResponseWriter, r *http.Request) {
	iid := r.PathValue("iid")
	var body struct {
		ProjectID string `json:"project_id"`
		Name      string `json:"name"`
		TimeRange string `json:"time_range"`
		Status    string `json:"status"`
		PackageID string `json:"package_id"`
		IFlowID   string `json:"iflow_id"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.TimeRange == "" {
		body.TimeRange = "Past Hour"
	}

	var t MonitoringTile
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO monitoring_tiles (project_id, instance_id, name, time_range, status, package_id, iflow_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)
		 RETURNING id, project_id, instance_id, name, time_range, status, package_id, iflow_id, sort_order, created_at`,
		body.ProjectID, iid, body.Name, body.TimeRange, body.Status, body.PackageID, body.IFlowID,
	).Scan(&t.ID, &t.ProjectID, &t.InstanceID, &t.Name, &t.TimeRange,
		&t.Status, &t.PackageID, &t.IFlowID, &t.SortOrder, &t.CreatedAt)
	if err != nil {
		h.log.Error("create tile", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, t)
}

func (h *Handler) deleteTile(w http.ResponseWriter, r *http.Request) {
	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM monitoring_tiles WHERE id=$1 AND instance_id=$2`,
		r.PathValue("tid"), r.PathValue("iid"))
	if err != nil {
		h.log.Error("delete tile", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		apiError(w, 404, "tile not found")
		return
	}
	w.WriteHeader(204)
}

// ── Tile count (calls SAP) ────────────────────────────────────────────────────

func (h *Handler) getTileCount(w http.ResponseWriter, r *http.Request) {
	iid := r.PathValue("iid")
	tid := r.PathValue("tid")

	// Load tile config
	var t MonitoringTile
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, project_id, instance_id, name, time_range, status, package_id, iflow_id, sort_order, created_at
		 FROM monitoring_tiles WHERE id=$1 AND instance_id=$2`, tid, iid,
	).Scan(&t.ID, &t.ProjectID, &t.InstanceID, &t.Name, &t.TimeRange,
		&t.Status, &t.PackageID, &t.IFlowID, &t.SortOrder, &t.CreatedAt)
	if isNotFound(err) {
		apiError(w, 404, "tile not found")
		return
	}
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}

	client, err := h.sapClientForInstance(r, iid)
	if err != nil {
		apiError(w, 502, err.Error())
		return
	}

	filter := buildMonitorFilter(t.TimeRange, t.Status, t.PackageID, t.IFlowID, "")
	count, err := client.CountMessages(r.Context(), filter)
	if err != nil {
		h.log.Error("tile count", "error", err, "tile", tid)
		apiError(w, 502, err.Error())
		return
	}
	jsonResp(w, 200, map[string]int{"count": count})
}
