package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/testdata"
)

// ── Analyse ───────────────────────────────────────────────────────────────────

func (h *Handler) testdataAnalyse(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Content   string `json:"content"`
		InputType string `json:"input_type"`
	}
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var result testdata.AnalyseResult
	var err error
	if req.InputType == "xsd" {
		result, err = testdata.AnalyseXSD(req.Content)
	} else {
		result, err = testdata.Analyse(req.Content)
	}
	if err != nil {
		apiError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonResp(w, http.StatusOK, result)
}

// ── CSV template ──────────────────────────────────────────────────────────────

func (h *Handler) testdataCSVTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Content string `json:"content"`
	}
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := testdata.GenerateCSVTemplate(req.Content)
	if err != nil {
		apiError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonResp(w, http.StatusOK, result)
}

// ── Generate (ZIP download) ───────────────────────────────────────────────────

func (h *Handler) testdataGenerate(w http.ResponseWriter, r *http.Request) {
	var req testdata.GenerateRequest
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Template) == "" {
		apiError(w, http.StatusBadRequest, "template is required")
		return
	}
	if err := h.resolveLookupTables(r.Context(), req.Fields); err != nil {
		apiError(w, http.StatusBadRequest, err.Error())
		return
	}
	zipBytes, err := testdata.Generate(req)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="test_data.zip"`)
	w.Write(zipBytes) //nolint:errcheck
}

// ── Generate one ──────────────────────────────────────────────────────────────

func (h *Handler) testdataGenerateOne(w http.ResponseWriter, r *http.Request) {
	var req testdata.GenerateRequest
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Template) == "" {
		apiError(w, http.StatusBadRequest, "template is required")
		return
	}
	if err := h.resolveLookupTables(r.Context(), req.Fields); err != nil {
		apiError(w, http.StatusBadRequest, err.Error())
		return
	}
	xmlStr, err := testdata.GenerateSingle(req)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/xml")
	w.Write([]byte(xmlStr)) //nolint:errcheck
}

// ── Generate batch (JSON array for save-to-assets) ────────────────────────────

func (h *Handler) testdataGenerateBatch(w http.ResponseWriter, r *http.Request) {
	var req testdata.GenerateRequest
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Template) == "" {
		apiError(w, http.StatusBadRequest, "template is required")
		return
	}
	if err := h.resolveLookupTables(r.Context(), req.Fields); err != nil {
		apiError(w, http.StatusBadRequest, err.Error())
		return
	}
	docs, err := testdata.GenerateBatch(req)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResp(w, http.StatusOK, map[string]any{"documents": docs})
}

// ── Lookup tables ─────────────────────────────────────────────────────────────

type LookupTable struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Values    []string  `json:"values"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *Handler) listLookupTables(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := h.pool.Query(ctx,
		`SELECT id, name, values, created_at FROM lookup_tables ORDER BY name`)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var tables []LookupTable
	for rows.Next() {
		var t LookupTable
		var valJSON []byte
		if err := rows.Scan(&t.ID, &t.Name, &valJSON, &t.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal(valJSON, &t.Values) //nolint:errcheck
		if t.Values == nil {
			t.Values = []string{}
		}
		tables = append(tables, t)
	}
	if tables == nil {
		tables = []LookupTable{}
	}
	jsonResp(w, http.StatusOK, tables)
}

func (h *Handler) createLookupTable(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name   string   `json:"name"`
		Values []string `json:"values"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		apiError(w, http.StatusBadRequest, "name is required")
		return
	}
	if body.Values == nil {
		body.Values = []string{}
	}
	valJSON, _ := json.Marshal(body.Values)
	now := time.Now()
	var id string
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO lookup_tables (name, values, created_at) VALUES ($1, $2, $3) RETURNING id`,
		body.Name, valJSON, now).Scan(&id)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResp(w, http.StatusCreated, LookupTable{ID: id, Name: body.Name, Values: body.Values, CreatedAt: now})
}

func (h *Handler) updateLookupTable(w http.ResponseWriter, r *http.Request) {
	lid := r.PathValue("lid")
	var body struct {
		Name   string   `json:"name"`
		Values []string `json:"values"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Values == nil {
		body.Values = []string{}
	}
	valJSON, _ := json.Marshal(body.Values)
	tag, err := h.pool.Exec(r.Context(),
		`UPDATE lookup_tables SET name = $2, values = $3 WHERE id = $1`,
		lid, body.Name, valJSON)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, http.StatusNotFound, fmt.Sprintf("lookup table %q not found", lid))
		return
	}
	jsonResp(w, http.StatusOK, LookupTable{ID: lid, Name: body.Name, Values: body.Values})
}

func (h *Handler) deleteLookupTable(w http.ResponseWriter, r *http.Request) {
	lid := r.PathValue("lid")
	tag, err := h.pool.Exec(r.Context(), `DELETE FROM lookup_tables WHERE id = $1`, lid)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, http.StatusNotFound, fmt.Sprintf("lookup table %q not found", lid))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// resolveLookupTables populates LookupValues from DB for any field in lookup mode.
func (h *Handler) resolveLookupTables(ctx context.Context, fields []testdata.FieldConfig) error {
	for i, fc := range fields {
		if fc.Mode != testdata.ModeLookup || fc.LookupTableID == "" {
			continue
		}
		var valJSON []byte
		err := h.pool.QueryRow(ctx,
			`SELECT values FROM lookup_tables WHERE id = $1`, fc.LookupTableID).Scan(&valJSON)
		if err != nil {
			return fmt.Errorf("field %q: lookup table not found", fc.Path)
		}
		var vals []string
		if err := json.Unmarshal(valJSON, &vals); err != nil || len(vals) == 0 {
			return fmt.Errorf("field %q: lookup table is empty", fc.Path)
		}
		fields[i].LookupValues = vals
	}
	return nil
}
