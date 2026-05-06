package ifregistry

import (
	"encoding/json"
	"net/http"
	"time"
)

type MiddlewareNode struct {
	Platform  string `json:"platform"`
	Label     string `json:"label"`
	Transport string `json:"transport"`
	Note      string `json:"note"`
}

type Receiver struct {
	ID              string            `json:"id"`
	InterfaceID     string            `json:"interface_id"`
	SystemID        *string           `json:"system_id"`
	CpiIflowID      string            `json:"cpi_iflow_id"`
	Transport       string            `json:"transport"`
	AuthType        string            `json:"auth_type"`
	CredentialAlias string            `json:"credential_alias"`
	Meta            map[string]string `json:"meta"`
	CreatedAt       time.Time         `json:"created_at"`
}

type Interface struct {
	ID                  string            `json:"id"`
	ProjectID           string            `json:"project_id"`
	Name                string            `json:"name"`
	Description         string            `json:"description"`
	InterfaceType       string            `json:"interface_type"`
	Status              string            `json:"status"`
	SenderSystemID      *string           `json:"sender_system_id"`
	InterfaceRef        string            `json:"interface_ref"`
	IntegrationPlatform string            `json:"integration_platform"`
	CpiPackageID        string            `json:"cpi_package_id"`
	CpiIflowID          string            `json:"cpi_iflow_id"`
	Transport           string            `json:"transport"`
	AuthType            string            `json:"auth_type"`
	CredentialAlias     string            `json:"credential_alias"`
	EdgeStyle           string            `json:"edge_style"`
	EdgeRouting         string            `json:"edge_routing"`
	DebugTriggerEnabled bool              `json:"debug_trigger_enabled"`
	DebugTriggerMethod  string            `json:"debug_trigger_method"`
	DebugTriggerPath    string            `json:"debug_trigger_path"`
	DebugTriggerPayload string            `json:"debug_trigger_payload"`
	Meta                map[string]string `json:"meta"`
	MiddlewareChain     []MiddlewareNode  `json:"middleware_chain"`
	Receivers           []Receiver        `json:"receivers"`
	CreatedAt           time.Time         `json:"created_at"`
	UpdatedAt           time.Time         `json:"updated_at"`
}

const ifaceCols = `id, project_id, name, description, interface_type, status, sender_system_id,
	interface_ref, integration_platform, cpi_package_id, cpi_iflow_id, transport, auth_type, credential_alias,
	edge_style, edge_routing,
	debug_trigger_enabled, debug_trigger_method, debug_trigger_path, debug_trigger_payload,
	meta, middleware_chain, created_at, updated_at`

const recvCols = `id, interface_id, system_id, cpi_iflow_id, transport, auth_type, credential_alias, meta, created_at`

func (h *Handler) listInterfaces(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+ifaceCols+` FROM interfaces WHERE project_id=$1 ORDER BY name`, pid)
	if err != nil {
		h.log.Error("list interfaces", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	ifaces := []Interface{}
	for rows.Next() {
		iface, err := scanInterface(rows.Scan)
		if err != nil {
			h.log.Error("scan interface", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		ifaces = append(ifaces, iface)
	}

	if len(ifaces) > 0 {
		ids := make([]string, len(ifaces))
		index := map[string]int{}
		for i, iface := range ifaces {
			ids[i] = iface.ID
			index[iface.ID] = i
		}
		rrows, err := h.pool.Query(r.Context(),
			`SELECT `+recvCols+` FROM interface_receivers WHERE interface_id = ANY($1) ORDER BY created_at`, ids)
		if err != nil {
			h.log.Error("list receivers", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		defer rrows.Close()
		for rrows.Next() {
			rec, err := scanReceiver(rrows.Scan)
			if err != nil {
				h.log.Error("scan receiver", "error", err)
				apiError(w, 500, "internal error")
				return
			}
			i := index[rec.InterfaceID]
			ifaces[i].Receivers = append(ifaces[i].Receivers, rec)
		}
	}
	jsonResp(w, 200, ifaces)
}

func (h *Handler) getInterface(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	id  := r.PathValue("id")

	iface, err := scanInterface(h.pool.QueryRow(r.Context(),
		`SELECT `+ifaceCols+` FROM interfaces WHERE id=$1 AND project_id=$2`, id, pid).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("get interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	rrows, err := h.pool.Query(r.Context(),
		`SELECT `+recvCols+` FROM interface_receivers WHERE interface_id=$1 ORDER BY created_at`, id)
	if err != nil {
		h.log.Error("list receivers", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rrows.Close()
	for rrows.Next() {
		rec, err := scanReceiver(rrows.Scan)
		if err != nil {
			h.log.Error("scan receiver", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		iface.Receivers = append(iface.Receivers, rec)
	}
	jsonResp(w, 200, iface)
}

func (h *Handler) createInterface(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	var body interfaceBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.InterfaceType == ""   { body.InterfaceType = "point_to_point" }
	if body.Status == ""          { body.Status = "design" }
	if body.EdgeStyle == ""       { body.EdgeStyle = "solid" }
	if body.EdgeRouting == ""     { body.EdgeRouting = "bezier" }
	if body.Meta == nil           { body.Meta = map[string]string{} }
	if body.MiddlewareChain == nil { body.MiddlewareChain = []MiddlewareNode{} }
	metaJSON,  _ := json.Marshal(body.Meta)
	chainJSON, _ := json.Marshal(body.MiddlewareChain)

	iface, err := scanInterface(h.pool.QueryRow(r.Context(),
		`INSERT INTO interfaces
		 (project_id, name, description, interface_type, status, sender_system_id,
		  interface_ref, integration_platform, cpi_package_id, cpi_iflow_id, transport, auth_type, credential_alias,
		  edge_style, edge_routing,
		  debug_trigger_enabled, debug_trigger_method, debug_trigger_path, debug_trigger_payload,
		  meta, middleware_chain)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		 RETURNING `+ifaceCols,
		pid, body.Name, body.Description, body.InterfaceType, body.Status, body.SenderSystemID,
		body.InterfaceRef, body.IntegrationPlatform, body.CpiPackageID, body.CpiIflowID, body.Transport, body.AuthType, body.CredentialAlias,
		body.EdgeStyle, body.EdgeRouting,
		body.DebugTriggerEnabled, body.DebugTriggerMethod, body.DebugTriggerPath, body.DebugTriggerPayload,
		metaJSON, chainJSON,
	).Scan)
	if err != nil {
		h.log.Error("create interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	iface.Receivers = []Receiver{}
	jsonResp(w, 201, iface)
}

func (h *Handler) updateInterface(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	id  := r.PathValue("id")
	var body interfaceBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Meta == nil           { body.Meta = map[string]string{} }
	if body.MiddlewareChain == nil { body.MiddlewareChain = []MiddlewareNode{} }
	metaJSON,  _ := json.Marshal(body.Meta)
	chainJSON, _ := json.Marshal(body.MiddlewareChain)

	iface, err := scanInterface(h.pool.QueryRow(r.Context(),
		`UPDATE interfaces SET
		 name=$1, description=$2, interface_type=$3, status=$4, sender_system_id=$5,
		 interface_ref=$6, integration_platform=$7, cpi_package_id=$8, cpi_iflow_id=$9, transport=$10,
		 auth_type=$11, credential_alias=$12,
		 edge_style=$13, edge_routing=$14,
		 debug_trigger_enabled=$15, debug_trigger_method=$16,
		 debug_trigger_path=$17, debug_trigger_payload=$18,
		 meta=$19, middleware_chain=$20, updated_at=now()
		 WHERE id=$21 AND project_id=$22
		 RETURNING `+ifaceCols,
		body.Name, body.Description, body.InterfaceType, body.Status, body.SenderSystemID,
		body.InterfaceRef, body.IntegrationPlatform, body.CpiPackageID, body.CpiIflowID, body.Transport,
		body.AuthType, body.CredentialAlias,
		body.EdgeStyle, body.EdgeRouting,
		body.DebugTriggerEnabled, body.DebugTriggerMethod,
		body.DebugTriggerPath, body.DebugTriggerPayload,
		metaJSON, chainJSON, id, pid,
	).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	rrows, err := h.pool.Query(r.Context(),
		`SELECT `+recvCols+` FROM interface_receivers WHERE interface_id=$1 ORDER BY created_at`, id)
	if err == nil {
		defer rrows.Close()
		for rrows.Next() {
			rec, err := scanReceiver(rrows.Scan)
			if err == nil {
				iface.Receivers = append(iface.Receivers, rec)
			}
		}
	}
	jsonResp(w, 200, iface)
}

func (h *Handler) deleteInterface(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	id  := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(),
		`DELETE FROM interfaces WHERE id=$1 AND project_id=$2`, id, pid)
	if err != nil {
		h.log.Error("delete interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

// ── Receivers ────────────────────────────────────────────────────────────────

func (h *Handler) addReceiver(w http.ResponseWriter, r *http.Request) {
	ifaceID := r.PathValue("id")
	var body receiverBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Meta == nil { body.Meta = map[string]string{} }
	metaJSON, _ := json.Marshal(body.Meta)

	rec, err := scanReceiver(h.pool.QueryRow(r.Context(),
		`INSERT INTO interface_receivers
		 (interface_id, system_id, cpi_iflow_id, transport, auth_type, credential_alias, meta)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)
		 RETURNING `+recvCols,
		ifaceID, body.SystemID, body.CpiIflowID, body.Transport, body.AuthType, body.CredentialAlias, metaJSON,
	).Scan)
	if err != nil {
		h.log.Error("add receiver", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, rec)
}

func (h *Handler) updateReceiver(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	var body receiverBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Meta == nil { body.Meta = map[string]string{} }
	metaJSON, _ := json.Marshal(body.Meta)

	rec, err := scanReceiver(h.pool.QueryRow(r.Context(),
		`UPDATE interface_receivers SET
		 system_id=$1, cpi_iflow_id=$2, transport=$3, auth_type=$4, credential_alias=$5, meta=$6
		 WHERE id=$7
		 RETURNING `+recvCols,
		body.SystemID, body.CpiIflowID, body.Transport, body.AuthType, body.CredentialAlias, metaJSON, rid,
	).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update receiver", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, rec)
}

func (h *Handler) deleteReceiver(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	res, err := h.pool.Exec(r.Context(), `DELETE FROM interface_receivers WHERE id=$1`, rid)
	if err != nil {
		h.log.Error("delete receiver", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

// ── body types ───────────────────────────────────────────────────────────────

type interfaceBody struct {
	Name                string            `json:"name"`
	Description         string            `json:"description"`
	InterfaceType       string            `json:"interface_type"`
	Status              string            `json:"status"`
	SenderSystemID      *string           `json:"sender_system_id"`
	InterfaceRef        string            `json:"interface_ref"`
	IntegrationPlatform string            `json:"integration_platform"`
	CpiPackageID        string            `json:"cpi_package_id"`
	CpiIflowID          string            `json:"cpi_iflow_id"`
	Transport           string            `json:"transport"`
	AuthType            string            `json:"auth_type"`
	CredentialAlias     string            `json:"credential_alias"`
	EdgeStyle           string            `json:"edge_style"`
	EdgeRouting         string            `json:"edge_routing"`
	DebugTriggerEnabled bool              `json:"debug_trigger_enabled"`
	DebugTriggerMethod  string            `json:"debug_trigger_method"`
	DebugTriggerPath    string            `json:"debug_trigger_path"`
	DebugTriggerPayload string            `json:"debug_trigger_payload"`
	Meta                map[string]string `json:"meta"`
	MiddlewareChain     []MiddlewareNode  `json:"middleware_chain"`
}

type receiverBody struct {
	SystemID        *string           `json:"system_id"`
	CpiIflowID      string            `json:"cpi_iflow_id"`
	Transport       string            `json:"transport"`
	AuthType        string            `json:"auth_type"`
	CredentialAlias string            `json:"credential_alias"`
	Meta            map[string]string `json:"meta"`
}

// ── scan helpers ─────────────────────────────────────────────────────────────

type scanFn func(dest ...any) error

func scanInterface(scan scanFn) (Interface, error) {
	var iface    Interface
	var rawMeta  json.RawMessage
	var rawChain json.RawMessage
	err := scan(
		&iface.ID, &iface.ProjectID, &iface.Name, &iface.Description,
		&iface.InterfaceType, &iface.Status, &iface.SenderSystemID,
		&iface.InterfaceRef, &iface.IntegrationPlatform, &iface.CpiPackageID, &iface.CpiIflowID,
		&iface.Transport, &iface.AuthType, &iface.CredentialAlias,
		&iface.EdgeStyle, &iface.EdgeRouting,
		&iface.DebugTriggerEnabled, &iface.DebugTriggerMethod,
		&iface.DebugTriggerPath, &iface.DebugTriggerPayload,
		&rawMeta, &rawChain, &iface.CreatedAt, &iface.UpdatedAt,
	)
	if err != nil {
		return iface, err
	}
	if err := json.Unmarshal(rawMeta, &iface.Meta); err != nil {
		iface.Meta = map[string]string{}
	}
	if err := json.Unmarshal(rawChain, &iface.MiddlewareChain); err != nil {
		iface.MiddlewareChain = []MiddlewareNode{}
	}
	iface.Receivers = []Receiver{}
	return iface, nil
}

func scanReceiver(scan scanFn) (Receiver, error) {
	var rec     Receiver
	var rawMeta json.RawMessage
	err := scan(
		&rec.ID, &rec.InterfaceID, &rec.SystemID, &rec.CpiIflowID,
		&rec.Transport, &rec.AuthType, &rec.CredentialAlias, &rawMeta, &rec.CreatedAt,
	)
	if err != nil {
		return rec, err
	}
	if err := json.Unmarshal(rawMeta, &rec.Meta); err != nil {
		rec.Meta = map[string]string{}
	}
	return rec, nil
}
