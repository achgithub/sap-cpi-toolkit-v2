package api

import (
	"net/http"
	"time"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/crypto"
	"github.com/achgithub/sap-cpi-toolkit-v2/internal/sapclient"
)

type Instance struct {
	ID             string    `json:"id"`
	ProjectID      string    `json:"project_id"`
	Name           string    `json:"name"`
	URL            string    `json:"url"`
	TokenURL       string    `json:"token_url"`
	ClientID       string    `json:"client_id"`
	SystemType     string    `json:"system_type"`
	// PI (Process Integration) key — for calling iFlow HTTP adapters
	PIUrl          string    `json:"pi_url"`
	PITokenURL     string    `json:"pi_token_url"`
	PIClientID     string    `json:"pi_client_id"`
	RateMonitoring *int      `json:"rate_monitoring,omitempty"`
	RateOperations *int      `json:"rate_operations,omitempty"`
	RateRead       *int      `json:"rate_read,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ClientSecret and PIClientSecret are never included in responses — only accepted on write.

const instSelect = `id, project_id, name, url, token_url, client_id, system_type,
	pi_url, pi_token_url, pi_client_id,
	rate_monitoring, rate_operations, rate_read, created_at, updated_at`

func scanInstance(row interface{ Scan(...any) error }, inst *Instance) error {
	return row.Scan(
		&inst.ID, &inst.ProjectID, &inst.Name, &inst.URL, &inst.TokenURL, &inst.ClientID,
		&inst.SystemType,
		&inst.PIUrl, &inst.PITokenURL, &inst.PIClientID,
		&inst.RateMonitoring, &inst.RateOperations, &inst.RateRead,
		&inst.CreatedAt, &inst.UpdatedAt,
	)
}

func (h *Handler) listInstances(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT `+instSelect+` FROM instances WHERE project_id=$1 ORDER BY name`,
		r.PathValue("id"))
	if err != nil {
		h.log.Error("list instances", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	instances := []Instance{}
	for rows.Next() {
		var inst Instance
		if err := scanInstance(rows, &inst); err != nil {
			h.log.Error("scan instance", "error", err)
			apiError(w, 500, "internal error")
			return
		}
		instances = append(instances, inst)
	}
	jsonResp(w, 200, instances)
}

func (h *Handler) createInstance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name            string `json:"name"`
		URL             string `json:"url"`
		TokenURL        string `json:"token_url"`
		ClientID        string `json:"client_id"`
		ClientSecret    string `json:"client_secret"`
		SystemType      string `json:"system_type"`
		PIUrl           string `json:"pi_url"`
		PITokenURL      string `json:"pi_token_url"`
		PIClientID      string `json:"pi_client_id"`
		PIClientSecret  string `json:"pi_client_secret"`
		RateMonitoring  *int   `json:"rate_monitoring"`
		RateOperations  *int   `json:"rate_operations"`
		RateRead        *int   `json:"rate_read"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if body.Name == "" || body.URL == "" || body.TokenURL == "" || body.ClientID == "" || body.ClientSecret == "" {
		apiError(w, 400, "name, url, token_url, client_id and client_secret are required")
		return
	}
	if !validSystemType(body.SystemType) {
		apiError(w, 400, "system_type must be DEV, QA, PRD, SBX or TRL")
		return
	}

	enc, err := crypto.Encrypt(h.encKey, body.ClientSecret)
	if err != nil {
		h.log.Error("encrypt secret", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	piEnc := ""
	if body.PIClientSecret != "" {
		if piEnc, err = crypto.Encrypt(h.encKey, body.PIClientSecret); err != nil {
			h.log.Error("encrypt PI secret", "error", err)
			apiError(w, 500, "internal error")
			return
		}
	}

	var inst Instance
	err = scanInstance(h.pool.QueryRow(r.Context(),
		`INSERT INTO instances
		   (project_id, name, url, token_url, client_id, client_secret_enc, system_type,
		    pi_url, pi_token_url, pi_client_id, pi_client_secret_enc,
		    rate_monitoring, rate_operations, rate_read)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		 RETURNING `+instSelect,
		r.PathValue("id"), body.Name, body.URL, body.TokenURL, body.ClientID, enc, body.SystemType,
		body.PIUrl, body.PITokenURL, body.PIClientID, piEnc,
		body.RateMonitoring, body.RateOperations, body.RateRead,
	), &inst)
	if err != nil {
		h.log.Error("create instance", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 201, inst)
}

func (h *Handler) getInstance(w http.ResponseWriter, r *http.Request) {
	var inst Instance
	err := scanInstance(h.pool.QueryRow(r.Context(),
		`SELECT `+instSelect+` FROM instances WHERE id=$1 AND project_id=$2`,
		r.PathValue("iid"), r.PathValue("id"),
	), &inst)
	if isNotFound(err) {
		apiError(w, 404, "instance not found")
		return
	}
	if err != nil {
		h.log.Error("get instance", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	jsonResp(w, 200, inst)
}

func (h *Handler) updateInstance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name           string `json:"name"`
		URL            string `json:"url"`
		TokenURL       string `json:"token_url"`
		ClientID       string `json:"client_id"`
		ClientSecret   string `json:"client_secret"`  // empty = keep existing
		SystemType     string `json:"system_type"`
		PIUrl          string `json:"pi_url"`
		PITokenURL     string `json:"pi_token_url"`
		PIClientID     string `json:"pi_client_id"`
		PIClientSecret string `json:"pi_client_secret"` // empty = keep existing
		RateMonitoring *int   `json:"rate_monitoring"`
		RateOperations *int   `json:"rate_operations"`
		RateRead       *int   `json:"rate_read"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	if body.Name == "" || body.URL == "" || body.TokenURL == "" || body.ClientID == "" {
		apiError(w, 400, "name, url, token_url and client_id are required")
		return
	}
	if !validSystemType(body.SystemType) {
		apiError(w, 400, "system_type must be DEV, QA, PRD, SBX or TRL")
		return
	}

	// Encrypt API secret if provided
	var encAPI, encPI string
	var err error
	if body.ClientSecret != "" {
		if encAPI, err = crypto.Encrypt(h.encKey, body.ClientSecret); err != nil {
			h.log.Error("encrypt secret", "error", err)
			apiError(w, 500, "internal error")
			return
		}
	}
	if body.PIClientSecret != "" {
		if encPI, err = crypto.Encrypt(h.encKey, body.PIClientSecret); err != nil {
			h.log.Error("encrypt PI secret", "error", err)
			apiError(w, 500, "internal error")
			return
		}
	}

	// Build query — only update secret columns when new values are provided
	var inst Instance
	switch {
	case encAPI != "" && encPI != "":
		err = scanInstance(h.pool.QueryRow(r.Context(),
			`UPDATE instances
			 SET name=$1, url=$2, token_url=$3, client_id=$4, client_secret_enc=$5,
			     system_type=$6, pi_url=$7, pi_token_url=$8, pi_client_id=$9, pi_client_secret_enc=$10,
			     rate_monitoring=$11, rate_operations=$12, rate_read=$13, updated_at=NOW()
			 WHERE id=$14 AND project_id=$15 RETURNING `+instSelect,
			body.Name, body.URL, body.TokenURL, body.ClientID, encAPI, body.SystemType,
			body.PIUrl, body.PITokenURL, body.PIClientID, encPI,
			body.RateMonitoring, body.RateOperations, body.RateRead,
			r.PathValue("iid"), r.PathValue("id"),
		), &inst)
	case encAPI != "":
		err = scanInstance(h.pool.QueryRow(r.Context(),
			`UPDATE instances
			 SET name=$1, url=$2, token_url=$3, client_id=$4, client_secret_enc=$5,
			     system_type=$6, pi_url=$7, pi_token_url=$8, pi_client_id=$9,
			     rate_monitoring=$10, rate_operations=$11, rate_read=$12, updated_at=NOW()
			 WHERE id=$13 AND project_id=$14 RETURNING `+instSelect,
			body.Name, body.URL, body.TokenURL, body.ClientID, encAPI, body.SystemType,
			body.PIUrl, body.PITokenURL, body.PIClientID,
			body.RateMonitoring, body.RateOperations, body.RateRead,
			r.PathValue("iid"), r.PathValue("id"),
		), &inst)
	case encPI != "":
		err = scanInstance(h.pool.QueryRow(r.Context(),
			`UPDATE instances
			 SET name=$1, url=$2, token_url=$3, client_id=$4,
			     system_type=$5, pi_url=$6, pi_token_url=$7, pi_client_id=$8, pi_client_secret_enc=$9,
			     rate_monitoring=$10, rate_operations=$11, rate_read=$12, updated_at=NOW()
			 WHERE id=$13 AND project_id=$14 RETURNING `+instSelect,
			body.Name, body.URL, body.TokenURL, body.ClientID, body.SystemType,
			body.PIUrl, body.PITokenURL, body.PIClientID, encPI,
			body.RateMonitoring, body.RateOperations, body.RateRead,
			r.PathValue("iid"), r.PathValue("id"),
		), &inst)
	default:
		err = scanInstance(h.pool.QueryRow(r.Context(),
			`UPDATE instances
			 SET name=$1, url=$2, token_url=$3, client_id=$4,
			     system_type=$5, pi_url=$6, pi_token_url=$7, pi_client_id=$8,
			     rate_monitoring=$9, rate_operations=$10, rate_read=$11, updated_at=NOW()
			 WHERE id=$12 AND project_id=$13 RETURNING `+instSelect,
			body.Name, body.URL, body.TokenURL, body.ClientID, body.SystemType,
			body.PIUrl, body.PITokenURL, body.PIClientID,
			body.RateMonitoring, body.RateOperations, body.RateRead,
			r.PathValue("iid"), r.PathValue("id"),
		), &inst)
	}

	if isNotFound(err) {
		apiError(w, 404, "instance not found")
		return
	}
	if err != nil {
		h.log.Error("update instance", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	// Invalidate cached SAP client — credentials or rate limits may have changed
	h.sapPool.Invalidate(inst.ID)
	jsonResp(w, 200, inst)
}

func (h *Handler) deleteInstance(w http.ResponseWriter, r *http.Request) {
	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM instances WHERE id=$1 AND project_id=$2`,
		r.PathValue("iid"), r.PathValue("id"))
	if err != nil {
		h.log.Error("delete instance", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	if tag.RowsAffected() == 0 {
		apiError(w, 404, "instance not found")
		return
	}
	h.sapPool.Invalidate(r.PathValue("iid"))
	w.WriteHeader(204)
}

// sapClientForInstance loads the instance from DB, decrypts the secret,
// and returns a ready-to-use SAP client from the pool.
func (h *Handler) sapClientForInstance(r *http.Request, instanceID string) (*sapclient.Client, error) {
	var (
		cfg       sapclient.InstanceConfig
		secretEnc string
		rateMon   *int
		rateOps   *int
		rateRead  *int
	)
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, url, token_url, client_id, client_secret_enc,
		        rate_monitoring, rate_operations, rate_read
		 FROM instances WHERE id=$1`, instanceID,
	).Scan(&cfg.ID, &cfg.URL, &cfg.TokenURL, &cfg.ClientID, &secretEnc,
		&rateMon, &rateOps, &rateRead)
	if err != nil {
		return nil, err
	}
	secret, err := crypto.Decrypt(h.encKey, secretEnc)
	if err != nil {
		return nil, err
	}
	cfg.ClientSecret = secret
	if rateMon != nil {
		cfg.RateMonitoring = *rateMon
	}
	if rateOps != nil {
		cfg.RateOperations = *rateOps
	}
	if rateRead != nil {
		cfg.RateRead = *rateRead
	}
	return h.sapPool.Get(cfg), nil
}

func validSystemType(t string) bool {
	switch t {
	case "DEV", "QA", "PRD", "SBX", "TRL":
		return true
	}
	return false
}
