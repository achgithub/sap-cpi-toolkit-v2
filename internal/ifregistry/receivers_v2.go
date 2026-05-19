package ifregistry

import (
	"encoding/json"
	"net/http"
	"time"
)

type ReceiverV2 struct {
	ID              string    `json:"id"`
	InterfaceID     string    `json:"interface_id"`
	SystemID        *string   `json:"system_id"`
	Transport       string    `json:"transport"`
	AuthType        string    `json:"auth_type"`
	CredentialAlias string    `json:"credential_alias"`
	Via             []HopV2   `json:"via"`
	CreatedAt       time.Time `json:"created_at"`
}

const recvV2Cols = `id, interface_id, system_id, transport, auth_type, credential_alias, via, created_at`

func scanReceiverV2(scan scanFn) (ReceiverV2, error) {
	var rec ReceiverV2
	var rawVia json.RawMessage
	err := scan(
		&rec.ID, &rec.InterfaceID, &rec.SystemID,
		&rec.Transport, &rec.AuthType, &rec.CredentialAlias,
		&rawVia, &rec.CreatedAt,
	)
	if err != nil {
		return rec, err
	}
	if err := json.Unmarshal(rawVia, &rec.Via); err != nil {
		rec.Via = []HopV2{}
	}
	return rec, nil
}

type receiverV2Body struct {
	SystemID        *string `json:"system_id"`
	Transport       string  `json:"transport"`
	AuthType        string  `json:"auth_type"`
	CredentialAlias string  `json:"credential_alias"`
	Via             []HopV2 `json:"via"`
}

func (h *Handler) addReceiverV2(w http.ResponseWriter, r *http.Request) {
	ifaceID := r.PathValue("id")
	var body receiverV2Body
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Via == nil {
		body.Via = []HopV2{}
	}
	viaJSON, _ := json.Marshal(body.Via)

	rec, err := scanReceiverV2(h.pool.QueryRow(r.Context(),
		`INSERT INTO interface_receivers_v2 (interface_id, system_id, transport, auth_type, credential_alias, via)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING `+recvV2Cols,
		ifaceID, body.SystemID, body.Transport, body.AuthType, body.CredentialAlias, viaJSON,
	).Scan)
	if err != nil {
		h.log.Error("add receiver v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, rec)
}

func (h *Handler) updateReceiverV2(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	var body receiverV2Body
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Via == nil {
		body.Via = []HopV2{}
	}
	viaJSON, _ := json.Marshal(body.Via)

	rec, err := scanReceiverV2(h.pool.QueryRow(r.Context(),
		`UPDATE interface_receivers_v2 SET
		 system_id=$1, transport=$2, auth_type=$3, credential_alias=$4, via=$5
		 WHERE id=$6 RETURNING `+recvV2Cols,
		body.SystemID, body.Transport, body.AuthType, body.CredentialAlias, viaJSON, rid,
	).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update receiver v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, rec)
}

func (h *Handler) deleteReceiverV2(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	res, err := h.pool.Exec(r.Context(), `DELETE FROM interface_receivers_v2 WHERE id=$1`, rid)
	if err != nil {
		h.log.Error("delete receiver v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) archiveReceiverV2(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	res, err := h.pool.Exec(r.Context(),
		`UPDATE interface_receivers_v2 SET archived_at=now() WHERE id=$1 AND archived_at IS NULL`, rid)
	if err != nil {
		h.log.Error("archive receiver v2", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) attachReceiversV2(r *http.Request, ifaces []InterfaceV2) error {
	if len(ifaces) == 0 {
		return nil
	}
	ids := make([]string, len(ifaces))
	idx := map[string]int{}
	for i, f := range ifaces {
		ids[i] = f.ID
		idx[f.ID] = i
	}
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+recvV2Cols+` FROM interface_receivers_v2
		 WHERE interface_id = ANY($1::uuid[]) AND archived_at IS NULL ORDER BY created_at`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		rec, err := scanReceiverV2(rows.Scan)
		if err != nil {
			return err
		}
		if i, ok := idx[rec.InterfaceID]; ok {
			ifaces[i].Receivers = append(ifaces[i].Receivers, rec)
		}
	}
	return nil
}
