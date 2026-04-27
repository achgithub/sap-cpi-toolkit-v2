package sapclient

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	DefaultRateMonitoring = 30
	DefaultRateOperations = 10
	DefaultRateRead       = 60
)

// InstanceConfig holds the decrypted connection parameters for one CPI tenant.
type InstanceConfig struct {
	ID             string
	URL            string
	TokenURL       string
	ClientID       string
	ClientSecret   string // plaintext — caller decrypts before passing
	RateMonitoring int    // calls/min, 0 = use package default
	RateOperations int
	RateRead       int
}

// Client makes authenticated, rate-limited calls to a single CPI tenant.
// Tokens are cached and refreshed automatically.
type Client struct {
	cfg  InstanceConfig
	http *http.Client
	lim  *instanceLimiter
	log  *slog.Logger

	mu      sync.Mutex
	token   string
	tokenEx time.Time
}

func newClient(cfg InstanceConfig, log *slog.Logger) *Client {
	mon := cfg.RateMonitoring
	if mon <= 0 {
		mon = DefaultRateMonitoring
	}
	ops := cfg.RateOperations
	if ops <= 0 {
		ops = DefaultRateOperations
	}
	rd := cfg.RateRead
	if rd <= 0 {
		rd = DefaultRateRead
	}
	return &Client{
		cfg:  cfg,
		http: &http.Client{Timeout: 30 * time.Second},
		lim:  newLimiter(mon, ops, rd),
		log:  log,
	}
}

// Do makes an authenticated request after waiting for the rate limiter.
// Callers should close the response body.
func (c *Client) Do(ctx context.Context, cat Category, method, path string, body io.Reader) (*http.Response, error) {
	if err := c.lim.Wait(ctx, cat); err != nil {
		return nil, fmt.Errorf("rate limit [%s %s]: %w", c.cfg.ID, path, err)
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return nil, fmt.Errorf("get token [%s]: %w", c.cfg.ID, err)
	}

	reqURL := strings.TrimRight(c.cfg.URL, "/") + path
	req, err := http.NewRequestWithContext(ctx, method, reqURL, body)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	c.log.Debug("SAP API call", "instance", c.cfg.ID, "method", method, "path", path)
	return c.http.Do(req)
}

// accessToken returns a valid OAuth token, refreshing if needed.
func (c *Client) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token != "" && time.Now().Before(c.tokenEx) {
		return c.token, nil
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.cfg.TokenURL,
		strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return "", fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	creds := base64.StdEncoding.EncodeToString(
		[]byte(c.cfg.ClientID + ":" + c.cfg.ClientSecret))
	req.Header.Set("Authorization", "Basic "+creds)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("token response %d: %s", resp.StatusCode, string(b))
	}

	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}

	c.token = tok.AccessToken
	c.tokenEx = time.Now().Add(time.Duration(tok.ExpiresIn-30) * time.Second)
	c.log.Debug("SAP token acquired", "instance", c.cfg.ID, "expires_in", tok.ExpiresIn)
	return c.token, nil
}

// InvalidateToken forces re-acquisition on the next request.
func (c *Client) InvalidateToken() {
	c.mu.Lock()
	c.token = ""
	c.mu.Unlock()
}

// ── Pool ──────────────────────────────────────────────────────────────────────

// Pool caches Clients keyed by instance ID, sharing tokens and rate limiters
// across requests to the same tenant.
type Pool struct {
	mu      sync.RWMutex
	clients map[string]*Client
	log     *slog.Logger
}

func NewPool(log *slog.Logger) *Pool {
	return &Pool{clients: make(map[string]*Client), log: log}
}

// Get returns a cached Client for the config, creating one if none exists.
func (p *Pool) Get(cfg InstanceConfig) *Client {
	p.mu.RLock()
	c, ok := p.clients[cfg.ID]
	p.mu.RUnlock()
	if ok {
		return c
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if c, ok := p.clients[cfg.ID]; ok {
		return c
	}
	c = newClient(cfg, p.log)
	p.clients[cfg.ID] = c
	return c
}

// Invalidate removes a cached client — call after updating instance credentials.
func (p *Pool) Invalidate(instanceID string) {
	p.mu.Lock()
	delete(p.clients, instanceID)
	p.mu.Unlock()
}
