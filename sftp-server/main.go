package main

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type AdapterConfig struct {
	ID                    string       `json:"id"`
	Name                  string       `json:"name"`
	Type                  string       `json:"type"`
	BehaviorMode          string       `json:"behavior_mode"`
	AuthMode              string       `json:"auth_mode"`
	SSHHostKey            string       `json:"ssh_host_key"`
	SSHHostKeyFingerprint string       `json:"ssh_host_key_fingerprint"`
	SSHPublicKey          string       `json:"ssh_public_key"`
	Credentials           *Credentials `json:"credentials"`
}

type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type diskHandler struct {
	root string
}

func newDiskHandler(root string) (*diskHandler, error) {
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, fmt.Errorf("failed to create sftp root %s: %w", root, err)
	}
	return &diskHandler{root: filepath.Clean(root)}, nil
}

func (h *diskHandler) realPath(p string) (string, error) {
	abs := filepath.Join(h.root, filepath.Clean("/"+p))
	if !strings.HasPrefix(abs, h.root+string(filepath.Separator)) && abs != h.root {
		return "", sftp.ErrSSHFxPermissionDenied
	}
	return abs, nil
}

func (h *diskHandler) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	real, err := h.realPath(r.Filepath)
	if err != nil {
		return nil, err
	}
	return os.Open(real)
}

func (h *diskHandler) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	real, err := h.realPath(r.Filepath)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(real), 0755); err != nil {
		return nil, err
	}
	return os.OpenFile(real, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
}

func (h *diskHandler) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	real, err := h.realPath(r.Filepath)
	if err != nil {
		return nil, err
	}
	switch r.Method {
	case "List":
		entries, err := os.ReadDir(real)
		if err != nil {
			return nil, err
		}
		infos := make([]os.FileInfo, 0, len(entries))
		for _, e := range entries {
			info, err := e.Info()
			if err != nil {
				continue
			}
			infos = append(infos, info)
		}
		return listerAt(infos), nil
	case "Stat", "Lstat":
		info, err := os.Stat(real)
		if err != nil {
			return nil, err
		}
		return listerAt([]os.FileInfo{info}), nil
	}
	return nil, fmt.Errorf("unsupported list method: %s", r.Method)
}

func (h *diskHandler) Filecmd(r *sftp.Request) error {
	real, err := h.realPath(r.Filepath)
	if err != nil {
		return err
	}
	switch r.Method {
	case "Setstat":
		return nil
	case "Rename":
		target, err := h.realPath(r.Target)
		if err != nil {
			return err
		}
		return os.Rename(real, target)
	case "Rmdir":
		return os.Remove(real)
	case "Remove":
		return os.Remove(real)
	case "Mkdir":
		return os.MkdirAll(real, 0755)
	case "Symlink":
		return sftp.ErrSSHFxOpUnsupported
	default:
		return fmt.Errorf("unsupported command: %s", r.Method)
	}
}

type listerAt []os.FileInfo

func (l listerAt) ListAt(ls []os.FileInfo, offset int64) (int, error) {
	idx := int(offset)
	if idx >= len(l) {
		return 0, io.EOF
	}
	n := copy(ls, l[idx:])
	if idx+n >= len(l) {
		return n, io.EOF
	}
	return n, nil
}

func main() {
	controlPlaneURL := os.Getenv("CONTROL_PLANE_URL")
	sftpRoot := os.Getenv("SFTP_ROOT_DIR")
	hostKeyPath := os.Getenv("HOST_KEY_PATH")

	if controlPlaneURL == "" {
		controlPlaneURL = "http://api:8080"
	}
	if sftpRoot == "" {
		sftpRoot = "/data/sftp"
	}
	if hostKeyPath == "" {
		hostKeyPath = "/data/host_key"
	}

	log.Printf("[sftp-server] starting (root: %s, control-plane: %s)", sftpRoot, controlPlaneURL)

	handler, err := newDiskHandler(sftpRoot)
	if err != nil {
		log.Fatalf("[sftp-server] failed to initialise SFTP root: %v", err)
	}

	config, err := fetchConfig(controlPlaneURL)
	if err != nil {
		log.Printf("[sftp-server] warning: failed to fetch initial config: %v — using persisted/generated host key", err)
		config = &AdapterConfig{}
	}

	if config.Credentials == nil || config.Credentials.Username == "" {
		log.Printf("[sftp-server] WARNING: credentials not configured — all password auth attempts will fail")
	}

	hostKey, err := loadOrGenerateHostKey(config.SSHHostKey, hostKeyPath)
	if err != nil {
		log.Fatalf("[sftp-server] failed to load host key: %v", err)
	}
	fingerprint := ssh.FingerprintSHA256(hostKey.PublicKey())
	log.Printf("[sftp-server] SSH host key fingerprint: %s", fingerprint)

	if config.SSHHostKeyFingerprint != fingerprint {
		go syncHostKeyToControlPlane(hostKeyPath, fingerprint, controlPlaneURL)
	}

	rsakeyPath := strings.TrimSuffix(hostKeyPath, ".key") + "_rsa.key"
	rsaKey, err := loadOrGenerateRSAKey(rsakeyPath)
	if err != nil {
		log.Printf("[sftp-server] warning: failed to load RSA host key: %v", err)
	}

	ecdsaKeyPath := strings.TrimSuffix(hostKeyPath, ".key") + "_ecdsa.key"
	ecdsaKey, err := loadOrGenerateECDSAKey(ecdsaKeyPath)
	if err != nil {
		log.Printf("[sftp-server] warning: failed to load ECDSA host key: %v", err)
	}

	sshConfig := &ssh.ServerConfig{
		MaxAuthTries: 20,
		PasswordCallback: func(conn ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			cfg, err := fetchConfig(controlPlaneURL)
			if err != nil {
				return nil, fmt.Errorf("config unavailable")
			}
			return handlePasswordAuth(conn.User(), string(pass), cfg)
		},
		PublicKeyCallback: func(conn ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			cfg, err := fetchConfig(controlPlaneURL)
			if err != nil {
				return nil, fmt.Errorf("config unavailable")
			}
			return handlePublicKeyAuth(conn.User(), key, cfg)
		},
	}
	sshConfig.AddHostKey(hostKey)
	if ecdsaKey != nil {
		sshConfig.AddHostKey(ecdsaKey)
	}
	if rsaKey != nil {
		sshConfig.AddHostKey(rsaKey)
	}

	listener, err := net.Listen("tcp", ":22")
	if err != nil {
		log.Fatalf("[sftp-server] failed to listen on port 22: %v", err)
	}
	defer listener.Close()
	log.Printf("[sftp-server] listening on :22")

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("[sftp-server] accept error: %v", err)
			continue
		}
		go handleConnection(conn, sshConfig, handler, controlPlaneURL)
	}
}

func reportActivity(controlPlaneURL string) {
	go func() {
		c := &http.Client{Timeout: 2 * time.Second}
		c.Post(fmt.Sprintf("%s/sftp-server/heartbeat", controlPlaneURL), "application/json", nil) //nolint:errcheck
	}()
}

func handleConnection(conn net.Conn, sshConfig *ssh.ServerConfig, handler *diskHandler, controlPlaneURL string) {
	reportActivity(controlPlaneURL)
	defer conn.Close()

	sshConn, chans, reqs, err := ssh.NewServerConn(conn, sshConfig)
	if err != nil {
		if err.Error() != "EOF" {
			log.Printf("[sftp-server] SSH handshake error: %v", err)
		}
		return
	}
	defer sshConn.Close()
	log.Printf("[sftp-server] login from %s as %s", sshConn.RemoteAddr(), sshConn.User())

	go ssh.DiscardRequests(reqs)

	for newChannel := range chans {
		if newChannel.ChannelType() != "session" {
			newChannel.Reject(ssh.UnknownChannelType, "unknown channel type")
			continue
		}
		channel, requests, err := newChannel.Accept()
		if err != nil {
			log.Printf("[sftp-server] could not accept channel: %v", err)
			continue
		}
		go handleChannel(channel, requests, handler)
	}
}

func handleChannel(channel ssh.Channel, requests <-chan *ssh.Request, handler *diskHandler) {
	defer channel.Close()
	for req := range requests {
		if req.Type == "subsystem" && string(req.Payload[4:]) == "sftp" {
			req.Reply(true, nil) //nolint:errcheck
			server := sftp.NewRequestServer(channel, sftp.Handlers{
				FileGet:  handler,
				FilePut:  handler,
				FileList: handler,
				FileCmd:  handler,
			})
			if err := server.Serve(); err != nil && err != io.EOF {
				log.Printf("[sftp-server] SFTP serve error: %v", err)
			}
			return
		}
		req.Reply(false, nil) //nolint:errcheck
	}
}

func handlePasswordAuth(user, pass string, config *AdapterConfig) (*ssh.Permissions, error) {
	if config.BehaviorMode == "failure" {
		return nil, fmt.Errorf("authentication failed")
	}
	if config.AuthMode == "key" {
		return nil, fmt.Errorf("password auth disabled")
	}
	if config.Credentials != nil {
		if user == config.Credentials.Username && pass == config.Credentials.Password {
			return &ssh.Permissions{}, nil
		}
		return nil, fmt.Errorf("invalid credentials")
	}
	return &ssh.Permissions{}, nil
}

func handlePublicKeyAuth(user string, key ssh.PublicKey, config *AdapterConfig) (*ssh.Permissions, error) {
	if config.BehaviorMode == "failure" {
		return nil, fmt.Errorf("authentication failed")
	}
	if config.AuthMode == "password" {
		return nil, fmt.Errorf("public key auth disabled")
	}
	if config.SSHPublicKey != "" {
		authorizedKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(config.SSHPublicKey))
		if err != nil {
			return nil, fmt.Errorf("invalid configured public key")
		}
		if ssh.FingerprintSHA256(authorizedKey) != ssh.FingerprintSHA256(key) {
			return nil, fmt.Errorf("public key not authorized")
		}
		return &ssh.Permissions{}, nil
	}
	return &ssh.Permissions{}, nil
}

// fetchConfig calls GET {controlPlaneURL}/sftp-server/config and returns the AdapterConfig.
func fetchConfig(controlPlaneURL string) (*AdapterConfig, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("%s/sftp-server/config", controlPlaneURL))
	if err != nil {
		return nil, fmt.Errorf("fetch config: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("config endpoint returned %d: %s", resp.StatusCode, string(body))
	}
	var config AdapterConfig
	if err := json.NewDecoder(resp.Body).Decode(&config); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	return &config, nil
}

// syncHostKeyToControlPlane pushes the current host key PEM + fingerprint to
// PUT {controlPlaneURL}/sftp-server/config so the UI stays in sync.
func syncHostKeyToControlPlane(hostKeyPath, fingerprint, controlPlaneURL string) {
	keyPEM, err := os.ReadFile(hostKeyPath)
	if err != nil {
		log.Printf("[sftp-server] warning: could not read host key for sync: %v", err)
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("%s/sftp-server/config", controlPlaneURL))
	if err != nil {
		log.Printf("[sftp-server] warning: could not fetch config for key sync: %v", err)
		return
	}
	defer resp.Body.Close()

	var cfg map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		log.Printf("[sftp-server] warning: could not decode config for key sync: %v", err)
		return
	}

	cfg["ssh_host_key"] = string(keyPEM)
	cfg["ssh_host_key_fingerprint"] = fingerprint

	body, _ := json.Marshal(cfg)
	req, _ := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/sftp-server/config", controlPlaneURL), strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	putResp, err := client.Do(req)
	if err != nil {
		log.Printf("[sftp-server] warning: could not sync host key: %v", err)
		return
	}
	putResp.Body.Close()
	log.Printf("[sftp-server] host key fingerprint synced: %s", fingerprint)
}

func loadOrGenerateHostKey(keyPEM, keyPath string) (ssh.Signer, error) {
	if keyPEM != "" {
		return signerFromPEM([]byte(keyPEM))
	}
	if keyPath != "" {
		if data, err := os.ReadFile(keyPath); err == nil {
			if signer, err := signerFromPEM(data); err == nil {
				return signer, nil
			}
			log.Printf("[sftp-server] warning: persisted key at %s invalid — regenerating", keyPath)
		}
	}
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate ed25519 key: %w", err)
	}
	if keyPath != "" {
		if err := persistHostKey(privateKey, keyPath); err != nil {
			log.Printf("[sftp-server] warning: could not persist host key: %v", err)
		}
	}
	return ssh.NewSignerFromKey(privateKey)
}

func signerFromPEM(data []byte) (ssh.Signer, error) {
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}
	if block.Type == "PRIVATE KEY" {
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err == nil {
			return ssh.NewSignerFromKey(key)
		}
	}
	if block.Type == "RSA PRIVATE KEY" {
		key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err == nil {
			return ssh.NewSignerFromKey(key)
		}
	}
	return nil, fmt.Errorf("failed to parse private key (type: %s)", block.Type)
}

func persistHostKey(key interface{}, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	pkcs8, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return fmt.Errorf("marshal key: %w", err)
	}
	return os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pkcs8}), 0600)
}

func loadOrGenerateRSAKey(keyPath string) (ssh.Signer, error) {
	if keyPath != "" {
		if data, err := os.ReadFile(keyPath); err == nil {
			if signer, err := signerFromPEM(data); err == nil {
				return signer, nil
			}
		}
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generate RSA key: %w", err)
	}
	if keyPath != "" {
		pemBytes := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
		if err := os.MkdirAll(filepath.Dir(keyPath), 0700); err == nil {
			os.WriteFile(keyPath, pemBytes, 0600) //nolint:errcheck
		}
	}
	return ssh.NewSignerFromKey(key)
}

func loadOrGenerateECDSAKey(keyPath string) (ssh.Signer, error) {
	if keyPath != "" {
		if data, err := os.ReadFile(keyPath); err == nil {
			if signer, err := signerFromPEM(data); err == nil {
				return signer, nil
			}
		}
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate ECDSA key: %w", err)
	}
	if keyPath != "" {
		pkcs8, err := x509.MarshalPKCS8PrivateKey(key)
		if err == nil {
			pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pkcs8})
			if err := os.MkdirAll(filepath.Dir(keyPath), 0700); err == nil {
				os.WriteFile(keyPath, pemBytes, 0600) //nolint:errcheck
			}
		}
	}
	return ssh.NewSignerFromKey(key)
}
