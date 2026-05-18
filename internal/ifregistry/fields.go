package ifregistry

import (
	"encoding/json"
	"net/http"
	"time"
)

type FieldDefinition struct {
	ID           string    `json:"id"`
	AppliesTo    string    `json:"applies_to"`
	FieldKey     string    `json:"field_key"`
	Label        string    `json:"label"`
	DataType     string    `json:"data_type"`
	Options      []string  `json:"options"`
	Required     bool      `json:"required"`
	DisplayOrder int       `json:"display_order"`
	Description  string    `json:"description"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type FieldValue struct {
	DefinitionID string `json:"definition_id"`
	FieldKey     string `json:"field_key"`
	Label        string `json:"label"`
	DataType     string `json:"data_type"`
	Value        string `json:"value"`
}

const fieldDefCols = `id, applies_to, field_key, label, data_type, options, required, display_order, description, created_at, updated_at`

func scanFieldDef(scan scanFn) (FieldDefinition, error) {
	var f FieldDefinition
	var rawOpts json.RawMessage
	err := scan(&f.ID, &f.AppliesTo, &f.FieldKey, &f.Label, &f.DataType,
		&rawOpts, &f.Required, &f.DisplayOrder, &f.Description, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return f, err
	}
	if err := json.Unmarshal(rawOpts, &f.Options); err != nil || f.Options == nil {
		f.Options = []string{}
	}
	return f, nil
}

type fieldDefBody struct {
	AppliesTo    string   `json:"applies_to"`
	FieldKey     string   `json:"field_key"`
	Label        string   `json:"label"`
	DataType     string   `json:"data_type"`
	Options      []string `json:"options"`
	Required     bool     `json:"required"`
	DisplayOrder int      `json:"display_order"`
	Description  string   `json:"description"`
}

// ── Field definitions ─────────────────────────────────────────────────────────

func (h *Handler) listFieldDefs(w http.ResponseWriter, r *http.Request) {
	appliesTo := r.URL.Query().Get("applies_to")
	var rows interface {
		Next() bool
		Scan(dest ...any) error
		Close()
	}
	var err error
	if appliesTo != "" {
		rows, err = h.pool.Query(r.Context(),
			`SELECT `+fieldDefCols+` FROM interface_field_definitions
			 WHERE applies_to = $1 OR applies_to = 'both'
			 ORDER BY display_order, label`, appliesTo)
	} else {
		rows, err = h.pool.Query(r.Context(),
			`SELECT `+fieldDefCols+` FROM interface_field_definitions ORDER BY display_order, label`)
	}
	if err != nil {
		h.log.Error("list field defs", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	out := []FieldDefinition{}
	for rows.Next() {
		f, err := scanFieldDef(rows.Scan)
		if err != nil {
			h.log.Error("scan field def", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		out = append(out, f)
	}
	jsonResp(w, 200, out)
}

func (h *Handler) createFieldDef(w http.ResponseWriter, r *http.Request) {
	var body fieldDefBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.FieldKey == "" || body.Label == "" {
		apiError(w, 400, "field_key and label are required")
		return
	}
	if body.AppliesTo == "" { body.AppliesTo = "interface" }
	if body.DataType == ""  { body.DataType = "text" }
	if body.Options == nil  { body.Options = []string{} }

	optsJSON, _ := json.Marshal(body.Options)
	f, err := scanFieldDef(h.pool.QueryRow(r.Context(),
		`INSERT INTO interface_field_definitions
		 (applies_to, field_key, label, data_type, options, required, display_order, description)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING `+fieldDefCols,
		body.AppliesTo, body.FieldKey, body.Label, body.DataType, optsJSON,
		body.Required, body.DisplayOrder, body.Description,
	).Scan)
	if err != nil {
		if isUniqueViolation(err) {
			apiError(w, 400, "field_key already exists for this applies_to")
			return
		}
		h.log.Error("create field def", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, f)
}

func (h *Handler) updateFieldDef(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body fieldDefBody
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if body.Options == nil { body.Options = []string{} }
	optsJSON, _ := json.Marshal(body.Options)

	f, err := scanFieldDef(h.pool.QueryRow(r.Context(),
		`UPDATE interface_field_definitions SET
		 label=$1, data_type=$2, options=$3, required=$4, display_order=$5, description=$6, updated_at=now()
		 WHERE id=$7 RETURNING `+fieldDefCols,
		body.Label, body.DataType, optsJSON, body.Required, body.DisplayOrder, body.Description, id,
	).Scan)
	if err != nil {
		if isNotFound(err) {
			apiError(w, 404, "not found")
			return
		}
		h.log.Error("update field def", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, f)
}

func (h *Handler) deleteFieldDef(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	res, err := h.pool.Exec(r.Context(), `DELETE FROM interface_field_definitions WHERE id=$1`, id)
	if err != nil {
		h.log.Error("delete field def", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if res.RowsAffected() == 0 {
		apiError(w, 404, "not found")
		return
	}
	w.WriteHeader(204)
}

// ── Interface field values ────────────────────────────────────────────────────

func (h *Handler) getInterfaceFields(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rows, err := h.pool.Query(r.Context(),
		`SELECT fd.id, fd.field_key, fd.label, fd.data_type, COALESCE(fv.value, '')
		 FROM interface_field_definitions fd
		 LEFT JOIN interface_field_values fv ON fv.definition_id = fd.id AND fv.interface_id = $1
		 WHERE fd.applies_to IN ('interface','both')
		 ORDER BY fd.display_order, fd.label`, id)
	if err != nil {
		h.log.Error("get interface fields", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	out := []FieldValue{}
	for rows.Next() {
		var f FieldValue
		if err := rows.Scan(&f.DefinitionID, &f.FieldKey, &f.Label, &f.DataType, &f.Value); err != nil {
			h.log.Error("scan interface field", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		out = append(out, f)
	}
	jsonResp(w, 200, out)
}

func (h *Handler) putInterfaceFields(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var values []struct {
		DefinitionID string `json:"definition_id"`
		Value        string `json:"value"`
	}
	if err := decode(r, &values); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	for _, v := range values {
		if v.Value == "" {
			h.pool.Exec(r.Context(), //nolint:errcheck
				`DELETE FROM interface_field_values WHERE interface_id=$1 AND definition_id=$2`,
				id, v.DefinitionID)
		} else {
			h.pool.Exec(r.Context(), //nolint:errcheck
				`INSERT INTO interface_field_values (interface_id, definition_id, value)
				 VALUES ($1,$2,$3)
				 ON CONFLICT (interface_id, definition_id) DO UPDATE SET value=$3, updated_at=now()`,
				id, v.DefinitionID, v.Value)
		}
	}
	h.getInterfaceFields(w, r)
}

// ── Receiver field values ─────────────────────────────────────────────────────

func (h *Handler) getReceiverFields(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	rows, err := h.pool.Query(r.Context(),
		`SELECT fd.id, fd.field_key, fd.label, fd.data_type, COALESCE(fv.value, '')
		 FROM interface_field_definitions fd
		 LEFT JOIN receiver_field_values fv ON fv.definition_id = fd.id AND fv.receiver_id = $1
		 WHERE fd.applies_to IN ('receiver','both')
		 ORDER BY fd.display_order, fd.label`, rid)
	if err != nil {
		h.log.Error("get receiver fields", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	out := []FieldValue{}
	for rows.Next() {
		var f FieldValue
		if err := rows.Scan(&f.DefinitionID, &f.FieldKey, &f.Label, &f.DataType, &f.Value); err != nil {
			h.log.Error("scan receiver field", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		out = append(out, f)
	}
	jsonResp(w, 200, out)
}

func (h *Handler) putReceiverFields(w http.ResponseWriter, r *http.Request) {
	rid := r.PathValue("rid")
	var values []struct {
		DefinitionID string `json:"definition_id"`
		Value        string `json:"value"`
	}
	if err := decode(r, &values); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	for _, v := range values {
		if v.Value == "" {
			h.pool.Exec(r.Context(), //nolint:errcheck
				`DELETE FROM receiver_field_values WHERE receiver_id=$1 AND definition_id=$2`,
				rid, v.DefinitionID)
		} else {
			h.pool.Exec(r.Context(), //nolint:errcheck
				`INSERT INTO receiver_field_values (receiver_id, definition_id, value)
				 VALUES ($1,$2,$3)
				 ON CONFLICT (receiver_id, definition_id) DO UPDATE SET value=$3, updated_at=now()`,
				rid, v.DefinitionID, v.Value)
		}
	}
	h.getReceiverFields(w, r)
}
