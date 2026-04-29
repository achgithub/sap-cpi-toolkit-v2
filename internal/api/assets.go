package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Asset struct {
	ID             string          `json:"id"`
	Name           string          `json:"name"`
	Type           string          `json:"type"`
	Meta           json.RawMessage `json:"meta"`
	ProjectID      *string         `json:"project_id"`
	ProjectName    *string         `json:"project_name,omitempty"`
	SubProjectID   *string         `json:"sub_project_id"`
	SubProjectName *string         `json:"sub_project_name,omitempty"`
	CreatedBy      string          `json:"created_by"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type AssetDetail struct {
	Asset
	Content string `json:"content"`
}

func (h *Handler) listAssets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	projectID    := strings.TrimSpace(q.Get("project_id"))
	subProjectID := strings.TrimSpace(q.Get("sub_project_id"))
	assetType    := strings.TrimSpace(q.Get("type"))

	sql := `
		SELECT a.id, a.name, a.type, a.meta,
		       a.project_id::text, p.name,
		       a.sub_project_id::text, sp.name,
		       a.created_by, a.created_at, a.updated_at
		FROM assets a
		LEFT JOIN projects     p  ON p.id  = a.project_id
		LEFT JOIN sub_projects sp ON sp.id = a.sub_project_id
		WHERE 1=1`
	args := []any{}

	if projectID != "" {
		args = append(args, projectID)
		sql += fmt.Sprintf(" AND a.project_id = $%d::uuid", len(args))
	}
	if subProjectID != "" {
		args = append(args, subProjectID)
		sql += fmt.Sprintf(" AND a.sub_project_id = $%d::uuid", len(args))
	}
	if assetType != "" {
		args = append(args, assetType)
		sql += fmt.Sprintf(" AND a.type = $%d", len(args))
	}
	sql += " ORDER BY a.updated_at DESC LIMIT 500"

	rows, err := h.pool.Query(r.Context(), sql, args...)
	if err != nil {
		h.log.Error("list assets", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	assets := []Asset{}
	for rows.Next() {
		var a Asset
		var metaBytes []byte
		if err := rows.Scan(
			&a.ID, &a.Name, &a.Type, &metaBytes,
			&a.ProjectID, &a.ProjectName,
			&a.SubProjectID, &a.SubProjectName,
			&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			h.log.Error("scan asset", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		if len(metaBytes) == 0 {
			metaBytes = []byte("{}")
		}
		a.Meta = json.RawMessage(metaBytes)
		assets = append(assets, a)
	}
	jsonResp(w, 200, assets)
}

func (h *Handler) createAsset(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name         string          `json:"name"`
		Type         string          `json:"type"`
		Content      string          `json:"content"`
		Meta         json.RawMessage `json:"meta"`
		ProjectID    *string         `json:"project_id"`
		SubProjectID *string         `json:"sub_project_id"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		apiError(w, 400, "name is required")
		return
	}
	if len(body.Meta) == 0 {
		body.Meta = json.RawMessage("{}")
	}

	var a AssetDetail
	var metaBytes []byte
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO assets (name, type, content, meta, project_id, sub_project_id, created_by)
		VALUES ($1, $2, $3, $4, $5::uuid, $6::uuid, $7)
		RETURNING id, name, type, content, meta,
		          project_id::text, sub_project_id::text,
		          created_by, created_at, updated_at`,
		body.Name, body.Type, body.Content, []byte(body.Meta),
		nullableUUID(body.ProjectID), nullableUUID(body.SubProjectID),
		userID(r),
	).Scan(
		&a.ID, &a.Name, &a.Type, &a.Content, &metaBytes,
		&a.ProjectID, &a.SubProjectID,
		&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		h.log.Error("create asset", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if len(metaBytes) == 0 {
		metaBytes = []byte("{}")
	}
	a.Meta = json.RawMessage(metaBytes)
	h.log.Info("asset created", "id", a.ID, "name", a.Name, "user", userID(r))
	jsonResp(w, 201, a)
}

func (h *Handler) getAsset(w http.ResponseWriter, r *http.Request) {
	var a AssetDetail
	var metaBytes []byte
	err := h.pool.QueryRow(r.Context(), `
		SELECT id, name, type, content, meta,
		       project_id::text, sub_project_id::text,
		       created_by, created_at, updated_at
		FROM assets WHERE id = $1`,
		r.PathValue("aid"),
	).Scan(
		&a.ID, &a.Name, &a.Type, &a.Content, &metaBytes,
		&a.ProjectID, &a.SubProjectID,
		&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt,
	)
	if isNotFound(err) {
		apiError(w, 404, "asset not found")
		return
	}
	if err != nil {
		h.log.Error("get asset", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if len(metaBytes) == 0 {
		metaBytes = []byte("{}")
	}
	a.Meta = json.RawMessage(metaBytes)
	jsonResp(w, 200, a)
}

func (h *Handler) updateAsset(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name         string          `json:"name"`
		Type         string          `json:"type"`
		Content      string          `json:"content"`
		Meta         json.RawMessage `json:"meta"`
		ProjectID    *string         `json:"project_id"`
		SubProjectID *string         `json:"sub_project_id"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		apiError(w, 400, "name is required")
		return
	}
	if len(body.Meta) == 0 {
		body.Meta = json.RawMessage("{}")
	}

	var a AssetDetail
	var metaBytes []byte
	err := h.pool.QueryRow(r.Context(), `
		UPDATE assets
		SET name=$2, type=$3, content=$4, meta=$5,
		    project_id=$6::uuid, sub_project_id=$7::uuid,
		    updated_at=NOW()
		WHERE id=$1
		RETURNING id, name, type, content, meta,
		          project_id::text, sub_project_id::text,
		          created_by, created_at, updated_at`,
		r.PathValue("aid"),
		body.Name, body.Type, body.Content, []byte(body.Meta),
		nullableUUID(body.ProjectID), nullableUUID(body.SubProjectID),
	).Scan(
		&a.ID, &a.Name, &a.Type, &a.Content, &metaBytes,
		&a.ProjectID, &a.SubProjectID,
		&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt,
	)
	if isNotFound(err) {
		apiError(w, 404, "asset not found")
		return
	}
	if err != nil {
		h.log.Error("update asset", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if len(metaBytes) == 0 {
		metaBytes = []byte("{}")
	}
	a.Meta = json.RawMessage(metaBytes)
	jsonResp(w, 200, a)
}

func (h *Handler) deleteAsset(w http.ResponseWriter, r *http.Request) {
	tag, err := h.pool.Exec(r.Context(), `DELETE FROM assets WHERE id=$1`, r.PathValue("aid"))
	if err != nil {
		h.log.Error("delete asset", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		apiError(w, 404, "asset not found")
		return
	}
	w.WriteHeader(204)
}

func nullableUUID(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}
