package ifregistry

import (
	"encoding/json"
	"errors"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

func isUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

// ViaHop is one intermediate step in an interface's routing path.
type ViaHop struct {
	Label    string  `json:"label"`
	SystemID *string `json:"system_id,omitempty"`
}

type Interface struct {
	ID                string     `json:"id"`
	Name              string     `json:"name"`
	Ref               string     `json:"ref"`
	BuildRef          string     `json:"build_ref"`
	Status            string     `json:"status"`
	InterfaceType     string     `json:"interface_type"`
	SenderSystemID    *string    `json:"sender_system_id"`
	LogicalGroupID    *string    `json:"logical_group_id"`
	SequenceInGroup   *int       `json:"sequence_in_group"`
	SenderStepLabel   string     `json:"sender_step_label"`
	ReceiverStepLabel string     `json:"receiver_step_label"`
	FunctionalDomain  string     `json:"functional_domain"`
	Via               []ViaHop   `json:"via"`
	DeliveryProjectID *string    `json:"delivery_project_id"`
	Description       string     `json:"description"`
	Receivers         []Receiver `json:"receivers"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

const ifaceCols = `id, name, ref, build_ref, status, interface_type,
	sender_system_id, logical_group_id, sequence_in_group,
	sender_step_label, receiver_step_label, functional_domain, via,
	delivery_project_id, description, created_at, updated_at`

func scanInterface(scan scanFn) (Interface, error) {
	var i      Interface
	var rawVia json.RawMessage
	err := scan(
		&i.ID, &i.Name, &i.Ref, &i.BuildRef, &i.Status, &i.InterfaceType,
		&i.SenderSystemID, &i.LogicalGroupID, &i.SequenceInGroup,
		&i.SenderStepLabel, &i.ReceiverStepLabel, &i.FunctionalDomain, &rawVia,
		&i.DeliveryProjectID, &i.Description, &i.CreatedAt, &i.UpdatedAt,
	)
	if err != nil {
		return i, err
	}
	i.Ref = strings.TrimSpace(i.Ref)
	if err := json.Unmarshal(rawVia, &i.Via); err != nil {
		i.Via = []ViaHop{}
	}
	i.Receivers = []Receiver{}
	return i, nil
}

type interfaceBody struct {
	Name              string    `json:"name"`
	Ref               string    `json:"ref"`
	BuildRef          string    `json:"build_ref"`
	Status            string    `json:"status"`
	InterfaceType     string    `json:"interface_type"`
	SenderSystemID    *string   `json:"sender_system_id"`
	LogicalGroupID    *string   `json:"logical_group_id"`
	SequenceInGroup   *int      `json:"sequence_in_group"`
	SenderStepLabel   string    `json:"sender_step_label"`
	ReceiverStepLabel string    `json:"receiver_step_label"`
	FunctionalDomain  string    `json:"functional_domain"`
	Via               []ViaHop  `json:"via"`
	DeliveryProjectID *string   `json:"delivery_project_id"`
	Description       string    `json:"description"`
}

const refChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateRef() string {
	b := make([]byte, 10)
	for i := range b {
		b[i] = refChars[rand.Intn(len(refChars))]
	}
	return string(b)
}

func (h *Handler) listInterfaces(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	// Optional filters via query params
	var conditions []string
	conditions = append(conditions, "archived_at IS NULL")
	var args []any
	idx := 1

	if v := q.Get("status"); v != "" {
		conditions = append(conditions, "status = ANY($"+itoa(idx)+"::text[])")
		args = append(args, strings.Split(v, ","))
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
	if v := q.Get("delivery_project_id"); v != "" {
		conditions = append(conditions, "delivery_project_id = $"+itoa(idx)+"::uuid")
		args = append(args, v)
		idx++
	}

	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + strings.Join(conditions, " AND ")
	}

	rows, err := h.pool.Query(r.Context(),
		`SELECT `+ifaceCols+` FROM interfaces`+where+` ORDER BY name`, args...)
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
	rows.Close()

	if err := h.attachReceivers(r, ifaces); err != nil {
		h.log.Error("attach receivers", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	jsonResp(w, 200, ifaces)
}

func (h *Handler) getInterface(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	iface, err := scanInterface(h.pool.QueryRow(r.Context(),
		`SELECT `+ifaceCols+` FROM interfaces WHERE id=$1`, id).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("get interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	recvRows, err := h.pool.Query(r.Context(),
		`SELECT `+recvCols+` FROM interface_receivers WHERE interface_id=$1 ORDER BY created_at`, id)
	if err == nil {
		defer recvRows.Close()
		for recvRows.Next() {
			rec, err := scanReceiver(recvRows.Scan)
			if err == nil {
				iface.Receivers = append(iface.Receivers, rec)
			}
		}
	}
	jsonResp(w, 200, iface)
}

func (h *Handler) createInterface(w http.ResponseWriter, r *http.Request) {
	var body interfaceBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Name == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.Status == ""        { body.Status = "design" }
	if body.InterfaceType == "" { body.InterfaceType = "point_to_point" }

	// Generate unique ref if not provided
	ref := strings.TrimSpace(body.Ref)
	if ref == "" {
		for attempts := 0; attempts < 10; attempts++ {
			candidate := generateRef()
			var exists bool
			h.pool.QueryRow(r.Context(),
				`SELECT EXISTS(SELECT 1 FROM interfaces WHERE ref=$1)`, candidate,
			).Scan(&exists) //nolint:errcheck
			if !exists {
				ref = candidate
				break
			}
		}
	}

	if body.Via == nil {
		body.Via = []ViaHop{}
	}
	viaJSON, _ := json.Marshal(body.Via)

	iface, err := scanInterface(h.pool.QueryRow(r.Context(),
		`INSERT INTO interfaces
		 (name, ref, build_ref, status, interface_type,
		  sender_system_id, logical_group_id, sequence_in_group,
		  sender_step_label, receiver_step_label, functional_domain, via,
		  delivery_project_id, description)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		 RETURNING `+ifaceCols,
		body.Name, ref, body.BuildRef, body.Status, body.InterfaceType,
		body.SenderSystemID, body.LogicalGroupID, body.SequenceInGroup,
		body.SenderStepLabel, body.ReceiverStepLabel, body.FunctionalDomain, viaJSON,
		body.DeliveryProjectID, body.Description,
	).Scan)
	if err != nil {
		if isUniqueViolation(err) {
			apiError(w, 400, "ref already in use — choose a different reference")
			return
		}
		h.log.Error("create interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, iface)
}

func (h *Handler) updateInterface(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body interfaceBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}

	// Only update ref if the caller provided a non-empty value
	var refUpdate string
	if body.Ref != "" {
		refUpdate = body.Ref
	}
	if body.Via == nil {
		body.Via = []ViaHop{}
	}
	viaJSON, _ := json.Marshal(body.Via)

	iface, err := scanInterface(h.pool.QueryRow(r.Context(),
		`UPDATE interfaces SET
		 name=$1, build_ref=$2, status=$3, interface_type=$4,
		 sender_system_id=$5, logical_group_id=$6, sequence_in_group=$7,
		 sender_step_label=$8, receiver_step_label=$9, functional_domain=$10,
		 via=$11, delivery_project_id=$12, description=$13,
		 ref = CASE WHEN $14 = '' THEN ref ELSE $14 END,
		 updated_at=now()
		 WHERE id=$15
		 RETURNING `+ifaceCols,
		body.Name, body.BuildRef, body.Status, body.InterfaceType,
		body.SenderSystemID, body.LogicalGroupID, body.SequenceInGroup,
		body.SenderStepLabel, body.ReceiverStepLabel, body.FunctionalDomain,
		viaJSON, body.DeliveryProjectID, body.Description, refUpdate, id,
	).Scan)
	if err != nil {
		if isUniqueViolation(err) {
			apiError(w, 400, "ref already in use — choose a different reference")
			return
		}
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	recvRows, err := h.pool.Query(r.Context(),
		`SELECT `+recvCols+` FROM interface_receivers WHERE interface_id=$1 ORDER BY created_at`, id)
	if err == nil {
		defer recvRows.Close()
		for recvRows.Next() {
			rec, err := scanReceiver(recvRows.Scan)
			if err == nil {
				iface.Receivers = append(iface.Receivers, rec)
			}
		}
	}
	jsonResp(w, 200, iface)
}

func (h *Handler) deleteInterface(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(), `DELETE FROM interfaces WHERE id=$1`, id)
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

func (h *Handler) archiveInterface(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(),
		`UPDATE interfaces SET archived_at=now() WHERE id=$1 AND archived_at IS NULL`, id)
	if err != nil {
		h.log.Error("archive interface", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

// attachReceivers bulk-loads receivers for a slice of interfaces.
func (h *Handler) attachReceivers(r *http.Request, ifaces []Interface) error {
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
		`SELECT `+recvCols+` FROM interface_receivers WHERE interface_id = ANY($1::uuid[]) ORDER BY created_at`,
		ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		rec, err := scanReceiver(rows.Scan)
		if err != nil {
			return err
		}
		if i, ok := idx[rec.InterfaceID]; ok {
			ifaces[i].Receivers = append(ifaces[i].Receivers, rec)
		}
	}
	return nil
}

func itoa(n int) string { return strconv.Itoa(n) }
