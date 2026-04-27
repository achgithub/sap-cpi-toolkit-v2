package api

import (
	"bytes"
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/openpgp"       //nolint:staticcheck
	"golang.org/x/crypto/openpgp/armor" //nolint:staticcheck
	"golang.org/x/crypto/openpgp/packet" //nolint:staticcheck
	"golang.org/x/crypto/ssh"
)

const maxCertValidityDays = 90

// ── PGP ──────────────────────────────────────────────────────────────────────

func (h *Handler) generatePGP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Bits  int    `json:"bits"`
	}
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.Bits != 2048 && req.Bits != 4096 {
		req.Bits = 2048
	}

	cfg := &packet.Config{
		DefaultHash:            crypto.SHA256,
		DefaultCipher:          packet.CipherAES256,
		DefaultCompressionAlgo: packet.CompressionZLIB,
		RSABits:                req.Bits,
	}
	entity, err := openpgp.NewEntity(req.Name, "", req.Email, cfg)
	if err != nil {
		apiError(w, http.StatusInternalServerError, fmt.Sprintf("generate PGP entity: %v", err))
		return
	}

	var privBuf bytes.Buffer
	pw, err := armor.Encode(&privBuf, openpgp.PrivateKeyType, nil)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := entity.SerializePrivate(pw, nil); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	pw.Close()

	var pubBuf bytes.Buffer
	pubw, err := armor.Encode(&pubBuf, openpgp.PublicKeyType, nil)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := entity.Serialize(pubw); err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}
	pubw.Close()

	jsonResp(w, http.StatusOK, map[string]string{
		"public_key":  pubBuf.String(),
		"private_key": privBuf.String(),
	})
}

// ── SSH ───────────────────────────────────────────────────────────────────────

func (h *Handler) generateSSH(w http.ResponseWriter, r *http.Request) {
	var req struct {
		KeyType string `json:"key_type"` // "rsa" or "ed25519"
		Comment string `json:"comment"`
		Bits    int    `json:"bits"` // only for RSA
	}
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request")
		return
	}

	var pub, priv string
	var genErr error

	switch req.KeyType {
	case "rsa":
		bits := req.Bits
		if bits != 2048 && bits != 4096 {
			bits = 4096
		}
		key, err := rsa.GenerateKey(rand.Reader, bits)
		if err != nil {
			apiError(w, http.StatusInternalServerError, err.Error())
			return
		}
		pub, priv, genErr = marshalSSH(key, &key.PublicKey, req.Comment)
	case "ed25519":
		pubKey, privKey, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			apiError(w, http.StatusInternalServerError, err.Error())
			return
		}
		pub, priv, genErr = marshalSSH(privKey, pubKey, req.Comment)
	default:
		apiError(w, http.StatusBadRequest, "key_type must be rsa or ed25519")
		return
	}
	if genErr != nil {
		apiError(w, http.StatusInternalServerError, genErr.Error())
		return
	}

	jsonResp(w, http.StatusOK, map[string]string{
		"public_key":  pub,
		"private_key": priv,
	})
}

func marshalSSH(privKey crypto.Signer, pubKey interface{}, comment string) (pub, priv string, err error) {
	sshPub, err := ssh.NewPublicKey(pubKey)
	if err != nil {
		return "", "", fmt.Errorf("ssh public key: %w", err)
	}
	pubLine := string(ssh.MarshalAuthorizedKey(sshPub))
	if comment != "" {
		pubLine = pubLine[:len(pubLine)-1] + " " + comment + "\n"
	}
	privBlock, err := ssh.MarshalPrivateKey(privKey, comment)
	if err != nil {
		return "", "", fmt.Errorf("marshal private key: %w", err)
	}
	return pubLine, string(pem.EncodeToMemory(privBlock)), nil
}

// ── Certificate ───────────────────────────────────────────────────────────────

func (h *Handler) generateCert(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CommonName   string   `json:"common_name"`
		Org          string   `json:"org"`
		SANs         []string `json:"sans"`
		ValidityDays int      `json:"validity_days"`
	}
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.ValidityDays <= 0 || req.ValidityDays > maxCertValidityDays {
		req.ValidityDays = maxCertValidityDays
	}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	subject := pkix.Name{CommonName: req.CommonName}
	if req.Org != "" {
		subject.Organization = []string{req.Org}
	}

	sans := req.SANs
	if len(sans) == 0 {
		sans = []string{req.CommonName}
	}
	// filter empty strings
	filtered := sans[:0]
	for _, s := range sans {
		if strings.TrimSpace(s) != "" {
			filtered = append(filtered, strings.TrimSpace(s))
		}
	}
	if len(filtered) == 0 {
		filtered = []string{req.CommonName}
	}

	tmpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               subject,
		DNSNames:              filtered,
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().Add(time.Duration(req.ValidityDays) * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		apiError(w, http.StatusInternalServerError, err.Error())
		return
	}

	certPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER}))
	keyPEM := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))

	jsonResp(w, http.StatusOK, map[string]string{
		"certificate": certPEM,
		"private_key": keyPEM,
	})
}
