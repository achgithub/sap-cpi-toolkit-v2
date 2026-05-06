package ifregistry

import (
	"net/http"
	"strings"
)

type DiagramEdge struct {
	SenderSystemID   string   `json:"sender_system_id"`
	ReceiverSystemID string   `json:"receiver_system_id"`
	Count            int      `json:"count"`
	Refs             []string `json:"refs"`
	Statuses         []string `json:"statuses"`
}

type DiagramResponse struct {
	Systems []System      `json:"systems"`
	Edges   []DiagramEdge `json:"edges"`
}

// getDiagram handles GET /diagram
//
// Algorithm:
//  1. Build pool = selected system IDs ∪ systems whose infra_type matches.
//  2. Query interface legs (one row per sender→receiver pair via JOIN):
//     - Strict: sender ∈ pool AND this receiver ∈ pool
//     - Loose:  sender ∈ pool OR  this receiver ∈ pool
//  3. Aggregate legs into undirected edges with counts.
//  4. Systems returned:
//     - Strict: only systems in pool that appeared in a visible leg
//     - Loose:  all systems that appeared (includes derived systems outside pool)
//  5. Frontend only draws a line when both system boxes are present.
func (h *Handler) getDiagram(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q   := r.URL.Query()

	systemIDs  := splitParam(q.Get("system_ids"))
	infraTypes := splitParam(q.Get("infra_types"))
	statuses   := splitParam(q.Get("statuses"))
	domains    := splitParam(q.Get("functional_domain"))
	projectID  := strings.TrimSpace(q.Get("delivery_project_id"))
	strict     := q.Get("strict") != "0"

	hasPool := systemIDs != nil || infraTypes != nil

	// Per-leg pool condition.
	// Strict: both this sender and this receiver must be in pool.
	// Loose:  at least one of sender/receiver must be in pool.
	poolCond := `i.sender_system_id IN (SELECT id FROM pool)
	             AND ir.system_id    IN (SELECT id FROM pool)`
	if !strict {
		poolCond = `(    i.sender_system_id IN (SELECT id FROM pool)
		              OR ir.system_id        IN (SELECT id FROM pool))`
	}

	edgeRows, err := h.pool.Query(ctx, `
		WITH pool AS (
			SELECT id FROM systems
			WHERE (
			      ($1::text[] IS NOT NULL AND id::text = ANY($1))
			   OR ($2::text[] IS NOT NULL AND infra_type = ANY($2))
			)
		)
		SELECT i.sender_system_id::text,
		       ir.system_id::text,
		       i.ref,
		       i.status
		FROM   interfaces i
		JOIN   interface_receivers ir ON ir.interface_id = i.id
		WHERE  ir.system_id IS NOT NULL
		  AND  i.sender_system_id IS NOT NULL
		  AND  ($3::text[] IS NULL OR i.status            = ANY($3))
		  AND  ($4::text[] IS NULL OR i.functional_domain = ANY($4))
		  AND  ($5 = ''            OR i.delivery_project_id::text = $5)
		  AND  (
		         ($1::text[] IS NULL AND $2::text[] IS NULL)
		      OR (`+poolCond+`)
		       )`,
		systemIDs, infraTypes, statuses, domains, projectID,
	)
	if err != nil {
		h.log.Error("diagram: query edges", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer edgeRows.Close()

	type edgeKey struct{ a, b string }
	edgeMap := map[edgeKey]*DiagramEdge{}
	usedIDs := map[string]bool{}

	for edgeRows.Next() {
		var senderID, receiverID, ref, status string
		if err := edgeRows.Scan(&senderID, &receiverID, &ref, &status); err != nil {
			h.log.Error("diagram: scan edge", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		a, b := senderID, receiverID
		if a > b {
			a, b = b, a
		}
		key := edgeKey{a, b}
		if _, ok := edgeMap[key]; !ok {
			edgeMap[key] = &DiagramEdge{SenderSystemID: a, ReceiverSystemID: b}
		}
		edgeMap[key].Count++
		edgeMap[key].Refs     = append(edgeMap[key].Refs,     ref)
		edgeMap[key].Statuses = append(edgeMap[key].Statuses, status)
		usedIDs[senderID]   = true
		usedIDs[receiverID] = true
	}
	edgeRows.Close()

	edges := make([]DiagramEdge, 0, len(edgeMap))
	for _, e := range edgeMap {
		edges = append(edges, *e)
	}

	// ── Systems ───────────────────────────────────────────────────────────────
	var (
		sysQuery string
		sysArgs  []any
	)

	switch {
	case !hasPool && statuses == nil && domains == nil && projectID == "":
		sysQuery = `SELECT ` + systemCols + ` FROM systems ORDER BY name`

	case len(usedIDs) == 0:
		// filters active but nothing matched — return no systems

	case hasPool && strict:
		// Strict: return only pool systems that appeared in visible legs
		used := setToSlice(usedIDs)
		sysQuery = `SELECT ` + systemCols + ` FROM systems
			WHERE id::text = ANY($1)
			  AND (
			        ($2::text[] IS NOT NULL AND id::text  = ANY($2))
			     OR ($3::text[] IS NOT NULL AND infra_type = ANY($3))
			      )
			ORDER BY name`
		sysArgs = []any{used, systemIDs, infraTypes}

	default:
		// Loose or status/domain-only: return every system that appeared
		sysQuery = `SELECT ` + systemCols + ` FROM systems
			WHERE id::text = ANY($1) ORDER BY name`
		sysArgs = []any{setToSlice(usedIDs)}
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

	jsonResp(w, 200, DiagramResponse{Systems: systems, Edges: edges})
}

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

func setToSlice(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
