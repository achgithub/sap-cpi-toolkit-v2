package api

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"sync"
	"time"
)

// ── TLS Bundle ────────────────────────────────────────────────────────────────

// TLSBundle holds a parsed certificate and its PEM encodings.
type TLSBundle struct {
	Certificate tls.Certificate
	CertPEM     []byte
	KeyPEM      []byte // kept for DB persistence; never sent to clients
	Info        CertInfo
}

// CertInfo contains human-readable certificate metadata.
type CertInfo struct {
	Subject     string    `json:"subject"`
	Issuer      string    `json:"issuer"`
	NotBefore   time.Time `json:"not_before"`
	NotAfter    time.Time `json:"not_after"`
	Fingerprint string    `json:"fingerprint"` // SHA-256 hex
	SelfSigned  bool      `json:"self_signed"`
}

// GenerateSelfSignedCert creates an ECDSA P-256 self-signed certificate valid for 10 years.
// hosts may be DNS names or IP addresses — all are added as SANs.
func GenerateSelfSignedCert(hosts ...string) (*TLSBundle, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, err
	}

	tmpl := x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "SAP CPI Toolkit — Mock Server"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	for _, h := range hosts {
		if ip := net.ParseIP(h); ip != nil {
			tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
		} else {
			tmpl.DNSNames = append(tmpl.DNSNames, h)
		}
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, key.Public(), key)
	if err != nil {
		return nil, err
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyBytes, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return nil, err
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyBytes})

	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, err
	}

	info, _ := parseCertInfo(certPEM)
	return &TLSBundle{Certificate: tlsCert, CertPEM: certPEM, KeyPEM: keyPEM, Info: info}, nil
}

// ParseCustomCert validates and parses a user-supplied cert+key PEM pair.
func ParseCustomCert(certPEM, keyPEM []byte) (*TLSBundle, error) {
	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("invalid cert/key pair: %w", err)
	}
	info, err := parseCertInfo(certPEM)
	if err != nil {
		return nil, err
	}
	return &TLSBundle{Certificate: tlsCert, CertPEM: certPEM, KeyPEM: keyPEM, Info: info}, nil
}

// parseCertInfo extracts human-readable metadata from a PEM certificate.
func parseCertInfo(certPEM []byte) (CertInfo, error) {
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return CertInfo{}, fmt.Errorf("no PEM block found")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return CertInfo{}, err
	}
	fp := sha256.Sum256(cert.Raw)
	fpHex := hex.EncodeToString(fp[:])
	// Format as colon-separated pairs for readability
	formatted := ""
	for i := 0; i < len(fpHex); i += 2 {
		if i > 0 {
			formatted += ":"
		}
		formatted += fpHex[i : i+2]
	}
	return CertInfo{
		Subject:     cert.Subject.CommonName,
		Issuer:      cert.Issuer.CommonName,
		NotBefore:   cert.NotBefore,
		NotAfter:    cert.NotAfter,
		Fingerprint: formatted,
		SelfSigned:  cert.Subject.String() == cert.Issuer.String(),
	}, nil
}

// ── CertHolder ────────────────────────────────────────────────────────────────

// CertHolder is a thread-safe container for the active TLS certificate.
// The TLS server uses GetCertificate so certs can be swapped without restart.
type CertHolder struct {
	mu     sync.RWMutex
	bundle *TLSBundle
}

func NewCertHolder(b *TLSBundle) *CertHolder {
	return &CertHolder{bundle: b}
}

// GetCertificate is called for every TLS handshake — returns the current cert.
func (h *CertHolder) GetCertificate(_ *tls.ClientHelloInfo) (*tls.Certificate, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return &h.bundle.Certificate, nil
}

// Set swaps the active certificate. New TLS connections immediately use it.
func (h *CertHolder) Set(b *TLSBundle) {
	h.mu.Lock()
	h.bundle = b
	h.mu.Unlock()
}

// Info returns a copy of the current certificate's metadata.
func (h *CertHolder) Info() CertInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.bundle.Info
}

// CertPEM returns the PEM encoding of the current certificate.
func (h *CertHolder) CertPEM() []byte {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.bundle.CertPEM
}
