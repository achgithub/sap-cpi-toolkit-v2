package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/auth"
)

//go:embed all:static
var staticFiles embed.FS

func main() {
	port := envOr("PORT", "3000")
	deploymentEnv := envOr("DEPLOYMENT_ENV", "local")
	baseURL := envOr("BASE_URL", "http://localhost:3000")
	apiURL := envOr("API_INTERNAL_URL", "http://api:8080")

	authMiddleware := auth.New(auth.Config{
		BypassEnabled: envOr("AUTH_BYPASS_ENABLED", "false") == "true",
		Environment:   deploymentEnv,
		BaseURL:       baseURL,
		ClientID:      os.Getenv("IAS_CLIENT_ID"),
		ClientSecret:  os.Getenv("IAS_CLIENT_SECRET"),
		TenantURL:     os.Getenv("IAS_TENANT_URL"),
	})

	groovyURL := envOr("GROOVY_INTERNAL_URL", "http://groovy-runner:8082")

	apiProxy    := mustProxy(apiURL,    "/api/v2")
	groovyProxy := mustProxy(groovyURL, "/api/groovy")

	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("[portal] failed to create static filesystem: %v", err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})

	mux.HandleFunc("/auth/login", authMiddleware.LoginHandler)
	mux.HandleFunc("/auth/callback", authMiddleware.CallbackHandler)
	mux.HandleFunc("/auth/logout", authMiddleware.LogoutHandler)

	mux.Handle("/api/v2/",     authMiddleware.Handler(apiProxy))
	mux.Handle("/api/groovy/", authMiddleware.Handler(groovyProxy))

	mux.Handle("/", authMiddleware.Handler(spaHandler(http.FileServer(http.FS(staticFS)))))

	addr := ":" + port
	log.Printf("[portal] listening on %s (env=%s, auth-bypass=%v)", addr, deploymentEnv, authMiddleware.IsActive())
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[portal] fatal: %v", err)
	}
}

func mustProxy(target, stripPrefix string) http.Handler {
	u, err := url.Parse(target)
	if err != nil {
		log.Fatalf("[portal] invalid proxy target %q: %v", target, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(u)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = strings.TrimPrefix(r.URL.Path, stripPrefix)
		if r.URL.Path == "" {
			r.URL.Path = "/"
		}
		proxy.ServeHTTP(w, r)
	})
}


func spaHandler(fileServer http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && !strings.Contains(r.URL.Path, ".") {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
