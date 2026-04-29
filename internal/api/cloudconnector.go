package api

import (
	"crypto/tls"
	"net/http"
	"os"
	"time"
)

func (h *Handler) cloudConnectorStatus(w http.ResponseWriter, r *http.Request) {
	ccURL := os.Getenv("CC_INTERNAL_URL")
	if ccURL == "" {
		ccURL = "https://sap-cloudconnector:8443"
	}

	client := &http.Client{
		Timeout: 3 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec — internal reachability probe only
		},
	}

	resp, err := client.Get(ccURL)
	if err != nil {
		jsonResp(w, 200, map[string]any{"running": false})
		return
	}
	resp.Body.Close()
	jsonResp(w, 200, map[string]any{"running": true, "status_code": resp.StatusCode})
}
