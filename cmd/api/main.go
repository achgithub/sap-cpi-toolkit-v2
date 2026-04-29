package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/api"
	"github.com/achgithub/sap-cpi-toolkit-v2/internal/crypto"
	"github.com/achgithub/sap-cpi-toolkit-v2/internal/db"
	"github.com/achgithub/sap-cpi-toolkit-v2/internal/logging"
	"github.com/achgithub/sap-cpi-toolkit-v2/internal/sapclient"
)

// devEncKey is used when DEPLOYMENT_ENV=local and ENC_KEY is unset.
// Never used in production — DEPLOYMENT_ENV=kyma requires ENC_KEY.
const devEncKey = "0000000000000000000000000000000000000000000000000000000000000000"

func main() {
	env := envOr("DEPLOYMENT_ENV", "local")
	log := logging.New(env)

	encKey, err := resolveEncKey(env)
	if err != nil {
		log.Error("invalid ENC_KEY", "error", err)
		os.Exit(1)
	}

	dsn := envOr("DB_URL", "postgres://toolkit:toolkit@postgres:5432/toolkit?sslmode=disable")
	port := envOr("PORT", "8080")

	ctx := context.Background()

	log.Info("connecting to database")
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		log.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	log.Info("database connected")

	log.Info("running migrations")
	if err := db.Migrate(ctx, pool, log); err != nil {
		log.Error("migration failed", "error", err)
		os.Exit(1)
	}
	log.Info("migrations complete")

	api.SeedGroovyScripts(ctx, pool, log)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		if err := db.HealthCheck(r.Context(), pool); err != nil {
			log.Error("health check failed", "error", err)
			http.Error(w, "db unavailable", http.StatusServiceUnavailable)
			return
		}
		fmt.Fprintln(w, "ok")
	})

	sapPool := sapclient.NewPool(log)
	sched := api.NewScheduler(ctx, pool, log)
	handler := api.New(pool, log, encKey, sapPool).WithScheduler(sched)

	// Generate self-signed fallback cert, then check DB for a saved custom cert.
	mockPort := envOr("MOCK_TLS_PORT", "8444")
	autoBundle, err := api.GenerateSelfSignedCert("localhost", "127.0.0.1", "api")
	if err != nil {
		log.Error("failed to generate mock TLS cert", "error", err)
		os.Exit(1)
	}
	certHolder := api.NewCertHolder(autoBundle)

	// Load persisted cert config (custom cert survives restarts).
	var certMode, savedCertPEM, savedKeyPEM string
	pool.QueryRow(ctx, `SELECT value FROM mock_server_config WHERE key='cert_mode'`).Scan(&certMode)         //nolint:errcheck
	pool.QueryRow(ctx, `SELECT value FROM mock_server_config WHERE key='custom_cert_pem'`).Scan(&savedCertPEM) //nolint:errcheck
	pool.QueryRow(ctx, `SELECT value FROM mock_server_config WHERE key='custom_key_pem'`).Scan(&savedKeyPEM)   //nolint:errcheck
	if certMode == "custom" && savedCertPEM != "" && savedKeyPEM != "" {
		if bundle, err := api.ParseCustomCert([]byte(savedCertPEM), []byte(savedKeyPEM)); err == nil {
			certHolder.Set(bundle)
			log.Info("mock server using custom certificate")
		} else {
			log.Warn("saved custom cert invalid, falling back to auto", "error", err)
		}
	}

	handler.WithMockTLS(certHolder, mockPort)
	handler.Register(mux)
	sched.Start()

	// Start dedicated HTTPS listener for mock server (public — no auth).
	mockSrv := &http.Server{
		Addr:    ":" + mockPort,
		Handler: handler.MockMux(),
		TLSConfig: &tls.Config{
			GetCertificate: certHolder.GetCertificate,
			MinVersion:     tls.VersionTLS12,
		},
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	go func() {
		log.Info("mock server listening", "port", mockPort, "tls", true)
		if err := mockSrv.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
			log.Error("mock server fatal", "error", err)
		}
	}()

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		quit := make(chan os.Signal, 1)
		signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
		<-quit
		log.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		mockSrv.Shutdown(shutdownCtx) //nolint:errcheck
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Error("shutdown error", "error", err)
		}
	}()

	log.Info("api listening", "port", port, "env", env)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server fatal", "error", err)
		os.Exit(1)
	}
}

func resolveEncKey(env string) ([]byte, error) {
	raw := os.Getenv("ENC_KEY")
	if raw == "" {
		if env == "local" {
			// Safe for local dev only — data encrypted with this key is not portable
			return crypto.ParseHexKey(devEncKey)
		}
		return nil, fmt.Errorf("ENC_KEY is required when DEPLOYMENT_ENV=%s", env)
	}
	return crypto.ParseHexKey(raw)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
