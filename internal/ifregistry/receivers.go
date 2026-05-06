package ifregistry

import (
	"encoding/json"
	"net/http"
	"time"
)

type Receiver struct {
	ID              string    `json:"id"`
	InterfaceID     string    `json:"interface_id"`
	SystemID        *string   `json:"system_id"`
	Transport       string    `json:"transport"`
	AuthType        string    `json:"auth_type"`
	CredentialAlias string    `json:"credential_alias"`
	Via             []ViaHop  `json:"via"`
	CreatedAt       time.Time `json:"created_at"`
}

const recvCols = `id, interface_id, system_id, transport, auth_type, credential_alias, via, created_at`

func scanReceiver(scan scanFn) (Receiver, error) {
	var rec    Receiver
	var rawVia json.RawMessage
	err := scan(&rec.ID, &rec.InterfaceID, &rec.SystemID,
		&rec.Transport, &rec.AuthType, &rec.CredentialAlias, &rawVia, &rec.CreatedAt)
	if err != nil {
		return rec, err
	}
	if err := json.Unmarshal(rawVia, &rec.Via); err != nil {
		rec.Via = []ViaHop{}
	}
	return rec, nil
}

type receiverBody struct {
	SystemID        *string  `json:"system_id"`
	Transport       string   `json:"transport"`
	AuthType        string   `json:"auth_type"`
	CredentialAlias string   `json:"credential_alias"`
	Via             []ViaHop `json:"via"`
}

func (h *Handler) addReceiver(w http.ResponseWriter, r *http.Request) {
	ifaceID := r.PathValue("id")
	var body receiverBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Via == nil {
		body.Via = []ViaHop{}
	}
	viaJSON, _ := json.Marshal(body.Via)

	rec, err := scanReceiver(h.pool.QueryRow(r.Context(),
		`INSERT INTO interface_receivers (interface_id, system_id, transport, auth_type, credential_alias, via)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING `+recvCols,
		ifaceID, body.SystemID, body.Transport, body.AuthType, body.CredentialAlias, viaJSON,
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
	if body.Via == nil {
		body.Via = []ViaHop{}
	}
	viaJSON, _ := json.Marshal(body.Via)

	rec, err := scanReceiver(h.pool.QueryRow(r.Context(),
		`UPDATE interface_receivers SET
		 system_id=$1, transport=$2, auth_type=$3, credential_alias=$4, via=$5
		 WHERE id=$6 RETURNING `+recvCols,
		body.SystemID, body.Transport, body.AuthType, body.CredentialAlias, viaJSON, rid,
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
