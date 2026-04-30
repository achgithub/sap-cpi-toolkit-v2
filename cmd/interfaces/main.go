package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/db"
	"github.com/achgithub/sap-cpi-toolkit-v2/internal/ifregistry"
	"github.com/achgithub/sap-cpi-toolkit-v2/internal/logging"
)

func main() {
	env := envOr("DEPLOYMENT_ENV", "local")
	log := logging.New(env)
	port := envOr("PORT", "8083")
	dsn := envOr("DB_URL", "postgres://toolkit:toolkit@postgres:5432/toolkit?sslmode=disable")

	ctx := context.Background()

	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		log.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		if err := db.HealthCheck(r.Context(), pool); err != nil {
			slog.Error("health check failed", "error", err)
			http.Error(w, "db unavailable", http.StatusServiceUnavailable)
			return
		}
		fmt.Fprintln(w, "ok")
	})

	ifregistry.New(pool, log).Register(mux)

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
		shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutCtx) //nolint:errcheck
	}()

	log.Info("interfaces service listening", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server fatal", "error", err)
		os.Exit(1)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
