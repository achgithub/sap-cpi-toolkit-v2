package api

import (
	"io"
	"net/http"
	"strings"
	"time"
)

var proxyClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 0 {
			if auth := via[0].Header.Get("Authorization"); auth != "" {
				req.Header.Set("Authorization", auth)
			}
		}
		if len(via) >= 10 {
			return http.ErrUseLastResponse
		}
		return nil
	},
}

func (h *Handler) proxyHTTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Method  string            `json:"method"`
		URL     string            `json:"url"`
		Headers []headerKV        `json:"headers"`
		Body    string            `json:"body"`
	}
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request")
		return
	}

	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "GET"
	}

	targetURL := strings.TrimSpace(req.URL)
	if targetURL == "" {
		apiError(w, http.StatusBadRequest, "url is required")
		return
	}
	if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
		apiError(w, http.StatusBadRequest, "url must start with http:// or https://")
		return
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	outReq, err := http.NewRequestWithContext(r.Context(), method, targetURL, bodyReader)
	if err != nil {
		apiError(w, http.StatusBadRequest, "invalid URL: "+err.Error())
		return
	}

	for _, hdr := range req.Headers {
		if strings.TrimSpace(hdr.Key) != "" {
			outReq.Header.Set(hdr.Key, hdr.Value)
		}
	}

	start := time.Now()
	resp, err := proxyClient.Do(outReq)
	durationMs := time.Since(start).Milliseconds()
	if err != nil {
		apiError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 5<<20)) // 5 MB cap

	respHeaders := make(map[string]string, len(resp.Header))
	for k := range resp.Header {
		respHeaders[k] = resp.Header.Get(k)
	}

	jsonResp(w, http.StatusOK, map[string]any{
		"status":     resp.StatusCode,
		"statusText": resp.Status,
		"headers":    respHeaders,
		"body":       string(respBody),
		"durationMs": durationMs,
	})
}

type headerKV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}
