package ifregistry

import (
	"encoding/json"
	"net/http"
	"time"
)

type Receiver struct {
	ID              string            `json:"id"`
	InterfaceID     string            `json:"interface_id"`
	SystemID        *string           `json:"system_id"`
	CpiIflowID      string            `json:"cpi_iflow_id"`
	Transport       string            `json:"transport"`
	AuthType        string            `json:"auth_type"`
	FirewallZone    string            `json:"firewall_zone"`
	CredentialAlias string            `json:"credential_alias"`
	Meta            map[string]string `json:"meta"`
	CreatedAt       time.Time         `json:"created_at"`
}

type Interface struct {
	ID                   string            `json:"id"`
	ProjectID            string            `json:"project_id"`
	Name                 string            `json:"name"`
	Description          string            `json:"description"`
	InterfaceType        string            `json:"interface_type"`
	Status               string            `json:"status"`
	SenderSystemID       *string           `json:"sender_system_id"`
	CpiPackageID         string            `json:"cpi_package_id"`
	CpiIflowID           string            `json:"cpi_iflow_id"`
	Transport            string            `json:"transport"`
	AuthType             string            `json:"auth_type"`
	FirewallZone         string            `json:"firewall_zone"`
	CredentialAlias      string            `json:"credential_alias"`
	DebugTriggerEnabled  bool              `json:"debug_trigger_enabled"`
	DebugTriggerMethod   string            `json:"debug_trigger_method"`
	DebugTriggerPath     string            `json:"debug_trigger_path"`
	DebugTriggerPayload  string            `json:"debug_trigger_payload"`
	Meta                 map[string]string `json:"meta"`
	Receivers            []Receiver        `json:"receivers"`
	CreatedAt            time.Time         `json:"created_at"`
	UpdatedAt            time.Time         `json:"updated_at"`
}

func (h *Handler) listInterfaces(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")

	rows, err := h.pool.Query(r.Context(),
		`SELECT id, project_id, name, description, interface_type, status, sender_system_id,
		        cpi_package_id, cpi_iflow_id, transport, auth_type, firewall_zone, credential_alias,
		        debug_trigger_enabled, debug_trigger_method, debug_trigger_path, debug_trigger_payload,
		        meta, created_at, updated_at
		 FROM interfaces WHERE project_id=$1 ORDER BY name`, pid)
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

	// Bulk-load receivers for all interfaces
	if len(ifaces) > 0 {
		ids := make([]string, len(ifaces))
		index := map[string]int{}
		for i, iface := range ifaces {
			ids[i] = iface.ID
			index[iface.ID] = i
		}
		rrows, err := h.pool.Query(r.Context(),
			`SELECT id, interface_id, system_id, cpi_iflow_id, transport, auth_type,
			        firewall_zone, credential_alias, meta, created_at
			 FROM interface_receivers WHERE interface_id = ANY($1) ORDER BY created_at`,
			ids)
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
	id := r.PathValue("id")

	var rawMeta json.RawMessage
	iface := Interface{}
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, project_id, name, description, interface_type, status, sender_system_id,
		        cpi_package_id, cpi_iflow_id, transport, auth_type, firewall_zone, credential_alias,
		        debug_trigger_enabled, debug_trigger_method, debug_trigger_path, debug_trigger_payload,
		        meta, created_at, updated_at
		 FROM interfaces WHERE id=$1 AND project_id=$2`, id, pid,
	).Scan(&iface.ID, &iface.ProjectID, &iface.Name, &iface.Description,
		&iface.InterfaceType, &iface.Status, &iface.SenderSystemID,
		&iface.CpiPackageID, &iface.CpiIflowID, &iface.Transport, &iface.AuthType,
		&iface.FirewallZone, &iface.CredentialAlias,
		&iface.DebugTriggerEnabled, &iface.DebugTriggerMethod,
		&iface.DebugTriggerPath, &iface.DebugTriggerPayload,
		&rawMeta, &iface.CreatedAt, &iface.UpdatedAt)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("get interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if err := json.Unmarshal(rawMeta, &iface.Meta); err != nil {
		iface.Meta = map[string]string{}
	}

	rrows, err := h.pool.Query(r.Context(),
		`SELECT id, interface_id, system_id, cpi_iflow_id, transport, auth_type,
		        firewall_zone, credential_alias, meta, created_at
		 FROM interface_receivers WHERE interface_id=$1 ORDER BY created_at`, id)
	if err != nil {
		h.log.Error("list receivers", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rrows.Close()
	iface.Receivers = []Receiver{}
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
	if body.InterfaceType == "" {
		body.InterfaceType = "point_to_point"
	}
	if body.Status == "" {
		body.Status = "design"
	}
	if body.Meta == nil {
		body.Meta = map[string]string{}
	}
	metaJSON, _ := json.Marshal(body.Meta)

	var iface Interface
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO interfaces
		   (project_id, name, description, interface_type, status, sender_system_id,
		    cpi_package_id, cpi_iflow_id, transport, auth_type, firewall_zone, credential_alias,
		    debug_trigger_enabled, debug_trigger_method, debug_trigger_path, debug_trigger_payload, meta)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		 RETURNING id, project_id, name, description, interface_type, status, sender_system_id,
		           cpi_package_id, cpi_iflow_id, transport, auth_type, firewall_zone, credential_alias,
		           debug_trigger_enabled, debug_trigger_method, debug_trigger_path, debug_trigger_payload,
		           meta, created_at, updated_at`,
		pid, body.Name, body.Description, body.InterfaceType, body.Status, body.SenderSystemID,
		body.CpiPackageID, body.CpiIflowID, body.Transport, body.AuthType,
		body.FirewallZone, body.CredentialAlias,
		body.DebugTriggerEnabled, body.DebugTriggerMethod, body.DebugTriggerPath, body.DebugTriggerPayload,
		metaJSON,
	).Scan(&iface.ID, &iface.ProjectID, &iface.Name, &iface.Description,
		&iface.InterfaceType, &iface.Status, &iface.SenderSystemID,
		&iface.CpiPackageID, &iface.CpiIflowID, &iface.Transport, &iface.AuthType,
		&iface.FirewallZone, &iface.CredentialAlias,
		&iface.DebugTriggerEnabled, &iface.DebugTriggerMethod,
		&iface.DebugTriggerPath, &iface.DebugTriggerPayload,
		&metaJSON, &iface.CreatedAt, &iface.UpdatedAt)
	if err != nil {
		h.log.Error("create interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	json.Unmarshal(metaJSON, &iface.Meta) //nolint:errcheck
	iface.Receivers = []Receiver{}
	jsonResp(w, 201, iface)
}

func (h *Handler) updateInterface(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	id := r.PathValue("id")
	var body interfaceBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Meta == nil {
		body.Meta = map[string]string{}
	}
	metaJSON, _ := json.Marshal(body.Meta)

	var iface Interface
	err := h.pool.QueryRow(r.Context(),
		`UPDATE interfaces SET
		   name=$1, description=$2, interface_type=$3, status=$4, sender_system_id=$5,
		   cpi_package_id=$6, cpi_iflow_id=$7, transport=$8, auth_type=$9,
		   firewall_zone=$10, credential_alias=$11,
		   debug_trigger_enabled=$12, debug_trigger_method=$13,
		   debug_trigger_path=$14, debug_trigger_payload=$15,
		   meta=$16, updated_at=now()
		 WHERE id=$17 AND project_id=$18
		 RETURNING id, project_id, name, description, interface_type, status, sender_system_id,
		           cpi_package_id, cpi_iflow_id, transport, auth_type, firewall_zone, credential_alias,
		           debug_trigger_enabled, debug_trigger_method, debug_trigger_path, debug_trigger_payload,
		           meta, created_at, updated_at`,
		body.Name, body.Description, body.InterfaceType, body.Status, body.SenderSystemID,
		body.CpiPackageID, body.CpiIflowID, body.Transport, body.AuthType,
		body.FirewallZone, body.CredentialAlias,
		body.DebugTriggerEnabled, body.DebugTriggerMethod,
		body.DebugTriggerPath, body.DebugTriggerPayload,
		metaJSON, id, pid,
	).Scan(&iface.ID, &iface.ProjectID, &iface.Name, &iface.Description,
		&iface.InterfaceType, &iface.Status, &iface.SenderSystemID,
		&iface.CpiPackageID, &iface.CpiIflowID, &iface.Transport, &iface.AuthType,
		&iface.FirewallZone, &iface.CredentialAlias,
		&iface.DebugTriggerEnabled, &iface.DebugTriggerMethod,
		&iface.DebugTriggerPath, &iface.DebugTriggerPayload,
		&metaJSON, &iface.CreatedAt, &iface.UpdatedAt)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	json.Unmarshal(metaJSON, &iface.Meta) //nolint:errcheck

	// Return with receivers
	rrows, err := h.pool.Query(r.Context(),
		`SELECT id, interface_id, system_id, cpi_iflow_id, transport, auth_type,
		        firewall_zone, credential_alias, meta, created_at
		 FROM interface_receivers WHERE interface_id=$1 ORDER BY created_at`, id)
	if err == nil {
		defer rrows.Close()
		iface.Receivers = []Receiver{}
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
	id := r.PathValue("id")
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
	if body.Meta == nil {
		body.Meta = map[string]string{}
	}
	metaJSON, _ := json.Marshal(body.Meta)

	var rec Receiver
	var rawMeta json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO interface_receivers
		   (interface_id, system_id, cpi_iflow_id, transport, auth_type, firewall_zone, credential_alias, meta)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 RETURNING id, interface_id, system_id, cpi_iflow_id, transport, auth_type,
		           firewall_zone, credential_alias, meta, created_at`,
		ifaceID, body.SystemID, body.CpiIflowID, body.Transport, body.AuthType,
		body.FirewallZone, body.CredentialAlias, metaJSON,
	).Scan(&rec.ID, &rec.InterfaceID, &rec.SystemID, &rec.CpiIflowID, &rec.Transport,
		&rec.AuthType, &rec.FirewallZone, &rec.CredentialAlias, &rawMeta, &rec.CreatedAt)
	if err != nil {
		h.log.Error("add receiver", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	json.Unmarshal(rawMeta, &rec.Meta) //nolint:errcheck
	jsonResp(w, 201, rec)
}

func (h *Handler) updateReceiver(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	var body receiverBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Meta == nil {
		body.Meta = map[string]string{}
	}
	metaJSON, _ := json.Marshal(body.Meta)

	var rec Receiver
	var rawMeta json.RawMessage
	err := h.pool.QueryRow(r.Context(),
		`UPDATE interface_receivers SET
		   system_id=$1, cpi_iflow_id=$2, transport=$3, auth_type=$4,
		   firewall_zone=$5, credential_alias=$6, meta=$7
		 WHERE id=$8
		 RETURNING id, interface_id, system_id, cpi_iflow_id, transport, auth_type,
		           firewall_zone, credential_alias, meta, created_at`,
		body.SystemID, body.CpiIflowID, body.Transport, body.AuthType,
		body.FirewallZone, body.CredentialAlias, metaJSON, rid,
	).Scan(&rec.ID, &rec.InterfaceID, &rec.SystemID, &rec.CpiIflowID, &rec.Transport,
		&rec.AuthType, &rec.FirewallZone, &rec.CredentialAlias, &rawMeta, &rec.CreatedAt)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update receiver", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	json.Unmarshal(rawMeta, &rec.Meta) //nolint:errcheck
	jsonResp(w, 200, rec)
}

func (h *Handler) deleteReceiver(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	res, err := h.pool.Exec(r.Context(),
		`DELETE FROM interface_receivers WHERE id=$1`, rid)
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
	CpiPackageID        string            `json:"cpi_package_id"`
	CpiIflowID          string            `json:"cpi_iflow_id"`
	Transport           string            `json:"transport"`
	AuthType            string            `json:"auth_type"`
	FirewallZone        string            `json:"firewall_zone"`
	CredentialAlias     string            `json:"credential_alias"`
	DebugTriggerEnabled bool              `json:"debug_trigger_enabled"`
	DebugTriggerMethod  string            `json:"debug_trigger_method"`
	DebugTriggerPath    string            `json:"debug_trigger_path"`
	DebugTriggerPayload string            `json:"debug_trigger_payload"`
	Meta                map[string]string `json:"meta"`
}

type receiverBody struct {
	SystemID        *string           `json:"system_id"`
	CpiIflowID      string            `json:"cpi_iflow_id"`
	Transport       string            `json:"transport"`
	AuthType        string            `json:"auth_type"`
	FirewallZone    string            `json:"firewall_zone"`
	CredentialAlias string            `json:"credential_alias"`
	Meta            map[string]string `json:"meta"`
}

// ── scan helpers ─────────────────────────────────────────────────────────────

type scanFn func(dest ...any) error

func scanInterface(scan scanFn) (Interface, error) {
	var iface Interface
	var rawMeta json.RawMessage
	err := scan(
		&iface.ID, &iface.ProjectID, &iface.Name, &iface.Description,
		&iface.InterfaceType, &iface.Status, &iface.SenderSystemID,
		&iface.CpiPackageID, &iface.CpiIflowID, &iface.Transport, &iface.AuthType,
		&iface.FirewallZone, &iface.CredentialAlias,
		&iface.DebugTriggerEnabled, &iface.DebugTriggerMethod,
		&iface.DebugTriggerPath, &iface.DebugTriggerPayload,
		&rawMeta, &iface.CreatedAt, &iface.UpdatedAt,
	)
	if err != nil {
		return iface, err
	}
	if err := json.Unmarshal(rawMeta, &iface.Meta); err != nil {
		iface.Meta = map[string]string{}
	}
	iface.Receivers = []Receiver{}
	return iface, nil
}

func scanReceiver(scan scanFn) (Receiver, error) {
	var rec Receiver
	var rawMeta json.RawMessage
	err := scan(
		&rec.ID, &rec.InterfaceID, &rec.SystemID, &rec.CpiIflowID, &rec.Transport,
		&rec.AuthType, &rec.FirewallZone, &rec.CredentialAlias, &rawMeta, &rec.CreatedAt,
	)
	if err != nil {
		return rec, err
	}
	if err := json.Unmarshal(rawMeta, &rec.Meta); err != nil {
		rec.Meta = map[string]string{}
	}
	return rec, nil
}
