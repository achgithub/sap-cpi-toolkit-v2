package ifregistry

import "net/http"

// getDiagramV2 handles GET /v2/diagram
//
// Same pool / strict-loose algorithm as getDiagram (V1) but queries
// interfaces_v2 + interface_receivers_v2.
// Left system  = COALESCE(trigger_system_id, source_system_id)
// Right system = interface_receivers_v2.system_id
// Integration components (via hops) are invisible — architecture view shows
// only business-system ↔ business-system edges.
func (h *Handler) getDiagramV2(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q   := r.URL.Query()

	systemIDs  := splitParam(q.Get("system_ids"))
	infraTypes := splitParam(q.Get("infra_types"))
	statuses   := splitParam(q.Get("statuses"))
	domains    := splitParam(q.Get("functional_domain"))
	strict     := q.Get("strict") != "0"

	hasPool := systemIDs != nil || infraTypes != nil

	poolCond := `COALESCE(i.trigger_system_id, i.source_system_id) IN (SELECT id FROM pool)
	             AND ir.system_id IN (SELECT id FROM pool)`
	if !strict {
		poolCond = `(    COALESCE(i.trigger_system_id, i.source_system_id) IN (SELECT id FROM pool)
		              OR ir.system_id IN (SELECT id FROM pool))`
	}

	edgeRows, err := h.pool.Query(ctx, `
		WITH pool AS (
			SELECT id FROM systems
			WHERE archived_at IS NULL
			  AND (
			        ($1::text[] IS NOT NULL AND id::text   = ANY($1))
			     OR ($2::text[] IS NOT NULL AND infra_type = ANY($2))
			      )
		)
		SELECT COALESCE(i.trigger_system_id, i.source_system_id)::text,
		       ir.system_id::text,
		       i.ref,
		       i.status
		FROM   interfaces_v2 i
		JOIN   interface_receivers_v2 ir ON ir.interface_id = i.id
		WHERE  ir.system_id IS NOT NULL
		  AND  COALESCE(i.trigger_system_id, i.source_system_id) IS NOT NULL
		  AND  i.archived_at  IS NULL
		  AND  ir.archived_at IS NULL
		  AND  ($3::text[] IS NULL OR i.status            = ANY($3))
		  AND  ($4::text[] IS NULL OR i.functional_domain = ANY($4))
		  AND  (
		         ($1::text[] IS NULL AND $2::text[] IS NULL)
		      OR (`+poolCond+`)
		       )`,
		systemIDs, infraTypes, statuses, domains,
	)
	if err != nil {
		h.log.Error("diagram v2: query edges", "error", err)
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
			h.log.Error("diagram v2: scan edge", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		a, b := senderID, receiverID
		if a > b { a, b = b, a }
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
	for _, e := range edgeMap { edges = append(edges, *e) }

	// ── Systems ───────────────────────────────────────────────────────────────
	var (
		sysQuery string
		sysArgs  []any
	)

	switch {
	case !hasPool && statuses == nil && domains == nil:
		sysQuery = `SELECT ` + systemCols + ` FROM systems WHERE archived_at IS NULL ORDER BY name`

	case len(usedIDs) == 0:
		// filters active but nothing matched

	case hasPool && strict:
		used := setToSlice(usedIDs)
		sysQuery = `SELECT ` + systemCols + ` FROM systems
			WHERE archived_at IS NULL
			  AND id::text = ANY($1)
			  AND (
			        ($2::text[] IS NOT NULL AND id::text   = ANY($2))
			     OR ($3::text[] IS NOT NULL AND infra_type = ANY($3))
			      )
			ORDER BY name`
		sysArgs = []any{used, systemIDs, infraTypes}

	default:
		sysQuery = `SELECT ` + systemCols + ` FROM systems
			WHERE archived_at IS NULL AND id::text = ANY($1) ORDER BY name`
		sysArgs = []any{setToSlice(usedIDs)}
	}

	systems := []System{}
	if sysQuery != "" {
		srows, err := h.pool.Query(ctx, sysQuery, sysArgs...)
		if err != nil {
			h.log.Error("diagram v2: query systems", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		defer srows.Close()
		for srows.Next() {
			s, err := scanSystem(srows)
			if err != nil {
				h.log.Error("diagram v2: scan system", "error", err)
				apiError(w, 500, "internal error")
				return
			}
			systems = append(systems, s)
		}
	}

	jsonResp(w, 200, DiagramResponse{Systems: systems, Edges: edges})
}
