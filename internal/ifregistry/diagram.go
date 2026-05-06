package ifregistry

import (
	"net/http"
	"strings"
)

// DiagramResponse is the payload returned by GET /projects/{pid}/diagram.
// It contains only the systems and interfaces that are visible given the
// current filter — all set logic lives in SQL.
type DiagramResponse struct {
	Systems    []System    `json:"systems"`
	Interfaces []Interface `json:"interfaces"`
}

// splitParam splits a comma-separated query param into a string slice.
// Returns nil (not an empty slice) when the param is absent or blank,
// so callers can use nil to mean "no filter on this dimension".
func splitParam(v string) []string {
	if v == "" {
		return nil
	}
	var out []string
	for _, p := range strings.Split(v, ",") {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// getDiagram handles GET /projects/{pid}/diagram
//
// Query params (all optional, comma-separated):
//   - systems:     UUIDs of explicitly-selected systems
//   - infra_types: infra_type values (e.g. "AWS,Azure")
//   - statuses:    interface status values (e.g. "active,dev")
//
// Filter rules (matches the old JS logic, now in SQL):
//
//	pool = selected system IDs ∪ systems whose infra_type is in infra_types
//
//	An interface is visible when:
//	  1. status is in the statuses list (or no status filter)
//	  2. sender is in pool AND at least one receiver is in pool  (or no pool filter)
//	  3. anchor: when system filter is active, at least one endpoint
//	     must be an explicitly-selected system (prevents pure infra↔infra
//	     interfaces from appearing when a specific system is also selected)
//
//	A system is visible when:
//	  • no filters → all systems
//	  • pool active → system is in pool AND participates in a visible interface
//	  • status-only → system participates in a visible interface
func (h *Handler) getDiagram(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	ctx := r.Context()
	q   := r.URL.Query()

	systemIDs  := splitParam(q.Get("systems"))
	infraTypes := splitParam(q.Get("infra_types"))
	statuses   := splitParam(q.Get("statuses"))

	hasPool := systemIDs != nil || infraTypes != nil

	// ── 1. Filtered interfaces ───────────────────────────────────────────────
	//
	// $1 = project_id
	// $2 = systemIDs  (text[] | NULL)
	// $3 = infraTypes (text[] | NULL)
	// $4 = statuses   (text[] | NULL)
	//
	// The pool CTE is always defined; when $2 and $3 are both NULL it is empty
	// but the main WHERE short-circuits via ($2 IS NULL AND $3 IS NULL).
	ifaceRows, err := h.pool.Query(ctx, `
		WITH pool AS (
			SELECT id FROM systems
			WHERE project_id = $1
			  AND (
			      ($2::text[] IS NOT NULL AND id::text = ANY($2))
			   OR ($3::text[] IS NOT NULL AND infra_type = ANY($3))
			  )
		)
		SELECT `+ifaceCols+`
		FROM   interfaces i
		WHERE  i.project_id = $1
		  AND  ($4::text[] IS NULL OR i.status = ANY($4))
		  AND  (
		         -- No pool filter: include everything
		         ($2::text[] IS NULL AND $3::text[] IS NULL)
		      OR (
		              -- sender in pool
		              EXISTS (SELECT 1 FROM pool WHERE id = i.sender_system_id)
		              -- at least one receiver in pool
		          AND EXISTS (
		                  SELECT 1 FROM interface_receivers ir
		                  JOIN   pool p ON ir.system_id = p.id
		                  WHERE  ir.interface_id = i.id
		              )
		              -- anchor: when system IDs provided, at least one endpoint
		              -- must be explicitly selected (not just infra-matched)
		          AND (
		                  $2::text[] IS NULL
		               OR i.sender_system_id::text = ANY($2)
		               OR EXISTS (
		                      SELECT 1 FROM interface_receivers ir2
		                      WHERE  ir2.interface_id = i.id
		                        AND  ir2.system_id::text = ANY($2)
		                  )
		              )
		          )
		       )
		ORDER BY i.name`,
		pid, systemIDs, infraTypes, statuses,
	)
	if err != nil {
		h.log.Error("diagram: query interfaces", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer ifaceRows.Close()

	ifaces := []Interface{}
	for ifaceRows.Next() {
		iface, err := scanInterface(ifaceRows.Scan)
		if err != nil {
			h.log.Error("diagram: scan interface", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		ifaces = append(ifaces, iface)
	}
	ifaceRows.Close()

	// ── 2. Receivers for filtered interfaces ─────────────────────────────────
	if len(ifaces) > 0 {
		ifaceIDs := make([]string, len(ifaces))
		idx      := map[string]int{}
		for i, f := range ifaces {
			ifaceIDs[i] = f.ID
			idx[f.ID]   = i
		}
		recvRows, err := h.pool.Query(ctx,
			`SELECT `+recvCols+`
			 FROM   interface_receivers
			 WHERE  interface_id::text = ANY($1)
			 ORDER  BY created_at`, ifaceIDs)
		if err != nil {
			h.log.Error("diagram: query receivers", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		defer recvRows.Close()
		for recvRows.Next() {
			rec, err := scanReceiver(recvRows.Scan)
			if err != nil {
				h.log.Error("diagram: scan receiver", "error", err)
				apiError(w, 500, "internal error")
				return
			}
			if i, ok := idx[rec.InterfaceID]; ok {
				ifaces[i].Receivers = append(ifaces[i].Receivers, rec)
			}
		}
	}

	// ── 3. Derive used system IDs from filtered interfaces ───────────────────
	usedIDs := map[string]bool{}
	for _, f := range ifaces {
		if f.SenderSystemID != nil {
			usedIDs[*f.SenderSystemID] = true
		}
		for _, rec := range f.Receivers {
			if rec.SystemID != nil {
				usedIDs[*rec.SystemID] = true
			}
		}
	}

	// ── 4. Visible systems ───────────────────────────────────────────────────
	var (
		sysQuery string
		sysArgs  []any
	)

	switch {
	case !hasPool && statuses == nil:
		// No filters at all — return every system in the project
		sysQuery = `SELECT ` + systemCols + ` FROM systems WHERE project_id=$1 ORDER BY name`
		sysArgs  = []any{pid}

	case len(usedIDs) == 0:
		// Filters active but nothing matched — return nothing

	case hasPool:
		// Pool filter: system must be in pool AND participate in a visible interface
		used := setToSlice(usedIDs)
		sysQuery = `SELECT ` + systemCols + ` FROM systems
			WHERE project_id = $1
			  AND id::text = ANY($2)
			  AND (
			      ($3::text[] IS NOT NULL AND id::text = ANY($3))
			   OR ($4::text[] IS NOT NULL AND infra_type = ANY($4))
			  )
			ORDER BY name`
		sysArgs = []any{pid, used, systemIDs, infraTypes}

	default:
		// Status-only filter: any system that participates in a visible interface
		sysQuery = `SELECT ` + systemCols + ` FROM systems
			WHERE project_id=$1 AND id::text = ANY($2) ORDER BY name`
		sysArgs = []any{pid, setToSlice(usedIDs)}
	}

	systems := []System{}
	if sysQuery != "" {
		srows, err := h.pool.Query(ctx, sysQuery, sysArgs...)
		if err != nil {
			h.log.Error("diagram: query systems", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		defer srows.Close()
		for srows.Next() {
			s, err := scanSystem(srows)
			if err != nil {
				h.log.Error("diagram: scan system", "error", err)
				apiError(w, 500, "internal error")
				return
			}
			systems = append(systems, s)
		}
	}

	jsonResp(w, 200, DiagramResponse{Systems: systems, Interfaces: ifaces})
}

func setToSlice(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
