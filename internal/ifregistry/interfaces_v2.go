package ifregistry

import (
	"crypto/rand"
	"encoding/json"
	"math/big"
	"net/http"
	"strings"
	"time"
)

// APICallout is a mid-flow synchronous call-out made by a component to a business system API.
// Visible in the detailed flow diagram only — not in architecture or group diagrams.
type APICallout struct {
	Label       string  `json:"label"`
	SystemID    *string `json:"system_id,omitempty"`
	SystemLabel *string `json:"system_label,omitempty"`
}

// HopV2 is a component hop in an interface routing path.
// Callouts are API calls the component makes during its processing (e.g. CPI calling MDG).
type HopV2 struct {
	Type        string       `json:"type"`                  // always "component"
	Label       string       `json:"label"`
	ComponentID *string      `json:"component_id,omitempty"`
	Callouts    []APICallout `json:"callouts,omitempty"`
}

type InterfaceV2 struct {
	ID                 string       `json:"id"`
	Name               string       `json:"name"`
	Ref                string       `json:"ref"`
	BuildRef           string       `json:"build_ref"`
	Status             string       `json:"status"`
	InterfaceType      string       `json:"interface_type"`
	FunctionalDomain   string       `json:"functional_domain"`
	Description        string       `json:"description"`
	LogicalGroupID     *string      `json:"logical_group_id"`
	SequenceInGroup    *int         `json:"sequence_in_group"`
	TriggerType        string       `json:"trigger_type"`
	TriggerSystemID    *string      `json:"trigger_system_id"`
	TriggerComponentID *string      `json:"trigger_component_id"`
	ScheduleExpression *string      `json:"schedule_expression"`
	SourceSystemID     *string      `json:"source_system_id"`
	InteractionPattern string       `json:"interaction_pattern"`
	Via                []HopV2      `json:"via"`
	APISpecURL         *string      `json:"api_spec_url,omitempty"`
	APIAuthScheme      *string      `json:"api_auth_scheme,omitempty"`
	APIDescription     *string      `json:"api_description,omitempty"`
	Receivers          []ReceiverV2 `json:"receivers"`
	CreatedAt          time.Time    `json:"created_at"`
	UpdatedAt          time.Time    `json:"updated_at"`
}

const ifaceV2Cols = `id, name, ref, build_ref, status, interface_type,
	functional_domain, description, logical_group_id, sequence_in_group,
	trigger_type, trigger_system_id, trigger_component_id,
	schedule_expression, source_system_id, interaction_pattern, via,
	api_spec_url, api_auth_scheme, api_description,
	created_at, updated_at`

func scanInterfaceV2(scan scanFn) (InterfaceV2, error) {
	var i InterfaceV2
	var rawVia json.RawMessage
	err := scan(
		&i.ID, &i.Name, &i.Ref, &i.BuildRef, &i.Status, &i.InterfaceType,
		&i.FunctionalDomain, &i.Description, &i.LogicalGroupID, &i.SequenceInGroup,
		&i.TriggerType, &i.TriggerSystemID, &i.TriggerComponentID,
		&i.ScheduleExpression, &i.SourceSystemID, &i.InteractionPattern, &rawVia,
		&i.APISpecURL, &i.APIAuthScheme, &i.APIDescription,
		&i.CreatedAt, &i.UpdatedAt,
	)
	if err != nil {
		return i, err
	}
	if err := json.Unmarshal(rawVia, &i.Via); err != nil {
		i.Via = []HopV2{}
	}
	i.Receivers = []ReceiverV2{}
	return i, nil
}

type interfaceV2Body struct {
	Name               string   `json:"name"`
	Ref                string   `json:"ref"`
	BuildRef           string   `json:"build_ref"`
	Status             string   `json:"status"`
	InterfaceType      string   `json:"interface_type"`
	FunctionalDomain   string   `json:"functional_domain"`
	Description        string   `json:"description"`
	LogicalGroupID     *string  `json:"logical_group_id"`
	SequenceInGroup    *int     `json:"sequence_in_group"`
	TriggerType        string   `json:"trigger_type"`
	TriggerSystemID    *string  `json:"trigger_system_id"`
	TriggerComponentID *string  `json:"trigger_component_id"`
	ScheduleExpression *string  `json:"schedule_expression"`
	SourceSystemID     *string  `json:"source_system_id"`
	InteractionPattern string   `json:"interaction_pattern"`
	Via                []HopV2  `json:"via"`
	APISpecURL         *string  `json:"api_spec_url"`
	APIAuthScheme      *string  `json:"api_auth_scheme"`
	APIDescription     *string  `json:"api_description"`
}

func generateRefV2() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 10)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		b[i] = chars[n.Int64()]
	}
	return string(b)
}

func (h *Handler) listInterfacesV2(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var conditions []string
	var args []any
	idx := 1

	if v := q.Get("status"); v != "" {
		conditions = append(conditions, "status = ANY($"+itoa(idx)+"::text[])")
		args = append(args, strings.Split(v, ","))
		idx++
	}
	if v := q.Get("interface_type"); v != "" {
		conditions = append(conditions, "interface_type = ANY($"+itoa(idx)+"::text[])")
		args = append(args, strings.Split(v, ","))
		idx++
	}
	if v := q.Get("trigger_type"); v != "" {
		conditions = append(conditions, "trigger_type = $"+itoa(idx))
		args = append(args, v)
		idx++
	}
	if v := q.Get("interaction_pattern"); v != "" {
		conditions = append(conditions, "interaction_pattern = $"+itoa(idx))
		args = append(args, v)
		idx++
	}
	if v := q.Get("trigger_system_id"); v != "" {
		conditions = append(conditions, "trigger_system_id = $"+itoa(idx)+"::uuid")
		args = append(args, v)
		idx++
	}
	if v := q.Get("source_system_id"); v != "" {
		conditions = append(conditions, "source_system_id = $"+itoa(idx)+"::uuid")
		args = append(args, v)
		idx++
	}
	if v := q.Get("trigger_component_id"); v != "" {
		conditions = append(conditions, "trigger_component_id = $"+itoa(idx)+"::uuid")
		args = append(args, v)
		idx++
	}
	if v := q.Get("functional_domain"); v != "" {
		conditions = append(conditions, "functional_domain = ANY($"+itoa(idx)+"::text[])")
		args = append(args, strings.Split(v, ","))
		idx++
	}
	if v := q.Get("logical_group_id"); v != "" {
		conditions = append(conditions, "logical_group_id = $"+itoa(idx)+"::uuid")
		args = append(args, v)
		idx++
	}

	if r.URL.Query().Get("include_archived") != "true" {
		conditions = append(conditions, "archived_at IS NULL")
	}
	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + strings.Join(conditions, " AND ")
	}

	rows, err := h.pool.Query(r.Context(),
		`SELECT `+ifaceV2Cols+` FROM interfaces_v2`+where+` ORDER BY name`, args...)
	if err != nil {
		h.log.Error("list interfaces v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	ifaces := []InterfaceV2{}
	for rows.Next() {
		iface, err := scanInterfaceV2(rows.Scan)
		if err != nil {
			h.log.Error("scan interface v2", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		ifaces = append(ifaces, iface)
	}
	rows.Close()

	if err := h.attachReceiversV2(r, ifaces); err != nil {
		h.log.Error("attach receivers v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, ifaces)
}

func (h *Handler) getInterfaceV2(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	iface, err := scanInterfaceV2(h.pool.QueryRow(r.Context(),
		`SELECT `+ifaceV2Cols+` FROM interfaces_v2 WHERE id=$1`, id).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("get interface v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	recvRows, err := h.pool.Query(r.Context(),
		`SELECT `+recvV2Cols+` FROM interface_receivers_v2 WHERE interface_id=$1 ORDER BY created_at`, id)
	if err == nil {
		defer recvRows.Close()
		for recvRows.Next() {
			rec, err := scanReceiverV2(recvRows.Scan)
			if err == nil {
				iface.Receivers = append(iface.Receivers, rec)
			}
		}
	}
	jsonResp(w, 200, iface)
}

func (h *Handler) createInterfaceV2(w http.ResponseWriter, r *http.Request) {
	var body interfaceV2Body
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.Status == ""             { body.Status = "design" }
	if body.InterfaceType == ""      { body.InterfaceType = "point_to_point" }
	if body.TriggerType == ""        { body.TriggerType = "system_push" }
	if body.InteractionPattern == "" { body.InteractionPattern = "async" }

	ref := strings.TrimSpace(body.Ref)
	if ref == "" {
		for range 10 {
			candidate := generateRefV2()
			var exists bool
			h.pool.QueryRow(r.Context(), //nolint:errcheck
				`SELECT EXISTS(SELECT 1 FROM interfaces_v2 WHERE ref=$1)`, candidate,
			).Scan(&exists)
			if !exists {
				ref = candidate
				break
			}
		}
	}
	if body.Via == nil {
		body.Via = []HopV2{}
	}
	viaJSON, _ := json.Marshal(body.Via)

	iface, err := scanInterfaceV2(h.pool.QueryRow(r.Context(),
		`INSERT INTO interfaces_v2
		 (name, ref, build_ref, status, interface_type,
		  functional_domain, description, logical_group_id, sequence_in_group,
		  trigger_type, trigger_system_id, trigger_component_id,
		  schedule_expression, source_system_id, interaction_pattern, via,
		  api_spec_url, api_auth_scheme, api_description)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		 RETURNING `+ifaceV2Cols,
		body.Name, ref, body.BuildRef, body.Status, body.InterfaceType,
		body.FunctionalDomain, body.Description, body.LogicalGroupID, body.SequenceInGroup,
		body.TriggerType, body.TriggerSystemID, body.TriggerComponentID,
		body.ScheduleExpression, body.SourceSystemID, body.InteractionPattern, viaJSON,
		body.APISpecURL, body.APIAuthScheme, body.APIDescription,
	).Scan)
	if err != nil {
		if isUniqueViolation(err) {
			apiError(w, 400, "ref already in use")
			return
		}
		h.log.Error("create interface v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, iface)
}

func (h *Handler) updateInterfaceV2(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body interfaceV2Body
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Via == nil {
		body.Via = []HopV2{}
	}
	viaJSON, _ := json.Marshal(body.Via)
	refUpdate := strings.TrimSpace(body.Ref)

	iface, err := scanInterfaceV2(h.pool.QueryRow(r.Context(),
		`UPDATE interfaces_v2 SET
		 name=$1, build_ref=$2, status=$3, interface_type=$4,
		 functional_domain=$5, description=$6, logical_group_id=$7, sequence_in_group=$8,
		 trigger_type=$9, trigger_system_id=$10, trigger_component_id=$11,
		 schedule_expression=$12, source_system_id=$13, interaction_pattern=$14, via=$15,
		 api_spec_url=$16, api_auth_scheme=$17, api_description=$18,
		 ref = CASE WHEN $19 = '' THEN ref ELSE $19 END,
		 updated_at=now()
		 WHERE id=$20 RETURNING `+ifaceV2Cols,
		body.Name, body.BuildRef, body.Status, body.InterfaceType,
		body.FunctionalDomain, body.Description, body.LogicalGroupID, body.SequenceInGroup,
		body.TriggerType, body.TriggerSystemID, body.TriggerComponentID,
		body.ScheduleExpression, body.SourceSystemID, body.InteractionPattern, viaJSON,
		body.APISpecURL, body.APIAuthScheme, body.APIDescription,
		refUpdate, id,
	).Scan)
	if err != nil {
		if isUniqueViolation(err) {
			apiError(w, 400, "ref already in use")
			return
		}
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update interface v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	recvRows, err := h.pool.Query(r.Context(),
		`SELECT `+recvV2Cols+` FROM interface_receivers_v2 WHERE interface_id=$1 ORDER BY created_at`, id)
	if err == nil {
		defer recvRows.Close()
		for recvRows.Next() {
			rec, err := scanReceiverV2(recvRows.Scan)
			if err == nil {
				iface.Receivers = append(iface.Receivers, rec)
			}
		}
	}
	jsonResp(w, 200, iface)
}

func (h *Handler) archiveInterfaceV2(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(),
		`UPDATE interfaces_v2 SET archived_at=now(), updated_at=now() WHERE id=$1 AND archived_at IS NULL`, id)
	if err != nil {
		h.log.Error("archive interface v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) unarchiveInterfaceV2(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	iface, err := scanInterfaceV2(h.pool.QueryRow(r.Context(),
		`UPDATE interfaces_v2 SET archived_at=NULL, updated_at=now() WHERE id=$1 RETURNING `+ifaceV2Cols, id).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("unarchive interface v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, iface)
}
