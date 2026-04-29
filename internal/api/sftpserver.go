package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/crypto"
)

// ── shared row scan ───────────────────────────────────────────────────────────

type sftpRow struct {
	ID                    string
	Name                  string
	AuthMode              string
	BehaviorMode          string
	Username              string
	PasswordEnc           string
	AuthorizedKeys        string
	SSHHostKey            string
	SSHHostKeyFingerprint string
	LastSeen              *time.Time
	UpdatedAt             time.Time
}

const sftpCols = `id, name, auth_mode, behavior_mode, username, password_enc,
	authorized_keys, ssh_host_key, ssh_host_key_fingerprint, last_seen, updated_at`

func (h *Handler) loadSFTPRow(r *http.Request) (*sftpRow, error) {
	var row sftpRow
	err := h.pool.QueryRow(r.Context(),
		`SELECT `+sftpCols+` FROM sftp_server_config WHERE id='default'`,
	).Scan(
		&row.ID, &row.Name, &row.AuthMode, &row.BehaviorMode,
		&row.Username, &row.PasswordEnc, &row.AuthorizedKeys,
		&row.SSHHostKey, &row.SSHHostKeyFingerprint,
		&row.LastSeen, &row.UpdatedAt,
	)
	return &row, err
}

// ── GET /sftp-server — UI endpoint (password masked) ─────────────────────────

func (h *Handler) getSFTPServer(w http.ResponseWriter, r *http.Request) {
	row, err := h.loadSFTPRow(r)
	if err != nil {
		h.log.Error("get sftp config", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	online := row.LastSeen != nil && time.Since(*row.LastSeen) < 35*time.Second

	maskedPassword := ""
	if row.PasswordEnc != "" {
		if plain, err := crypto.Decrypt(h.encKey, row.PasswordEnc); err == nil && len(plain) > 0 {
			if len(plain) <= 2 {
				maskedPassword = strings.Repeat("*", len(plain))
			} else {
				maskedPassword = plain[:2] + strings.Repeat("*", len(plain)-2)
			}
		}
	}

	jsonResp(w, 200, map[string]any{
		"id":                       row.ID,
		"name":                     row.Name,
		"auth_mode":                row.AuthMode,
		"behavior_mode":            row.BehaviorMode,
		"username":                 row.Username,
		"password_masked":          maskedPassword,
		"password_set":             row.PasswordEnc != "",
		"authorized_keys":          row.AuthorizedKeys,
		"ssh_host_key_fingerprint": row.SSHHostKeyFingerprint,
		"last_seen":                row.LastSeen,
		"online":                   online,
		"updated_at":               row.UpdatedAt,
	})
}

// ── GET /sftp-server/config — adapter endpoint (plaintext password) ───────────

func (h *Handler) getSFTPConfig(w http.ResponseWriter, r *http.Request) {
	row, err := h.loadSFTPRow(r)
	if err != nil {
		h.log.Error("get sftp config (adapter)", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	var creds *map[string]string
	if row.Username != "" || row.PasswordEnc != "" {
		plain, _ := crypto.Decrypt(h.encKey, row.PasswordEnc)
		m := map[string]string{"username": row.Username, "password": plain}
		creds = &m
	}

	jsonResp(w, 200, map[string]any{
		"id":                       row.ID,
		"name":                     row.Name,
		"type":                     "sftp",
		"behavior_mode":            row.BehaviorMode,
		"auth_mode":                row.AuthMode,
		"ssh_host_key":             row.SSHHostKey,
		"ssh_host_key_fingerprint": row.SSHHostKeyFingerprint,
		"ssh_public_key":           row.AuthorizedKeys,
		"credentials":              creds,
	})
}

// ── PUT /sftp-server/config — accepts both adapter key-sync and UI updates ───

func (h *Handler) putSFTPConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name                  string  `json:"name"`
		AuthMode              string  `json:"auth_mode"`
		BehaviorMode          string  `json:"behavior_mode"`
		Username              string  `json:"username"`
		Password              *string `json:"password"`
		AuthorizedKeys        string  `json:"authorized_keys"`
		SSHHostKey            string  `json:"ssh_host_key"`
		SSHHostKeyFingerprint string  `json:"ssh_host_key_fingerprint"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}

	// Load current row so unset fields keep their values.
	row, err := h.loadSFTPRow(r)
	if err != nil {
		h.log.Error("load sftp row for update", "error", err)
		apiError(w, 500, "internal error")
		return
	}

	if body.Name != "" {
		row.Name = body.Name
	}
	if body.AuthMode != "" {
		row.AuthMode = body.AuthMode
	}
	if body.BehaviorMode != "" {
		row.BehaviorMode = body.BehaviorMode
	}
	if body.Username != "" {
		row.Username = body.Username
	}
	if body.Password != nil {
		enc, err := crypto.Encrypt(h.encKey, *body.Password)
		if err != nil {
			apiError(w, 500, "failed to encrypt password")
			return
		}
		row.PasswordEnc = enc
	}
	if body.AuthorizedKeys != "" {
		row.AuthorizedKeys = body.AuthorizedKeys
	}
	if body.SSHHostKey != "" {
		row.SSHHostKey = body.SSHHostKey
	}
	if body.SSHHostKeyFingerprint != "" {
		row.SSHHostKeyFingerprint = body.SSHHostKeyFingerprint
	}

	_, err = h.pool.Exec(r.Context(), `
		UPDATE sftp_server_config SET
		  name=$2, auth_mode=$3, behavior_mode=$4,
		  username=$5, password_enc=$6, authorized_keys=$7,
		  ssh_host_key=$8, ssh_host_key_fingerprint=$9,
		  updated_at=NOW()
		WHERE id=$1`,
		"default",
		row.Name, row.AuthMode, row.BehaviorMode,
		row.Username, row.PasswordEnc, row.AuthorizedKeys,
		row.SSHHostKey, row.SSHHostKeyFingerprint,
	)
	if err != nil {
		h.log.Error("update sftp config", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	h.getSFTPServer(w, r)
}

// ── POST /sftp-server/heartbeat — adapter keep-alive ─────────────────────────

func (h *Handler) sftpHeartbeat(w http.ResponseWriter, r *http.Request) {
	_, err := h.pool.Exec(r.Context(),
		`UPDATE sftp_server_config SET last_seen=NOW() WHERE id='default'`)
	if err != nil {
		h.log.Error("sftp heartbeat", "error", err)
	}
	w.WriteHeader(204)
}
