package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type VolumeRunRequest struct {
	PackID      string `json:"pack_id"`
	Iterations  int    `json:"iterations"`
	Concurrency int    `json:"concurrency"`
	StopOnFail  bool   `json:"stop_on_failure"`
	SkipWaits   bool   `json:"skip_waits"`
}

type IterationResult struct {
	Iteration  int          `json:"iteration"`
	Status     string       `json:"status"` // "pass" | "fail"
	DurationMs int64        `json:"duration_ms"`
	Cases      []CaseResult `json:"cases"`
}

type VolumeSummary struct {
	Total       int     `json:"total"`
	Passed      int     `json:"passed"`
	Failed      int     `json:"failed"`
	AvgMs       float64 `json:"avg_ms"`
	MinMs       int64   `json:"min_ms"`
	MaxMs       int64   `json:"max_ms"`
	TotalTimeMs int64   `json:"total_time_ms"`
}

type VolumeEvent struct {
	Type    string           `json:"type"` // "progress" | "done" | "error"
	Result  *IterationResult `json:"result,omitempty"`
	Summary *VolumeSummary   `json:"summary,omitempty"`
	Message string           `json:"message,omitempty"`
}

// ── Handler ───────────────────────────────────────────────────────────────────

func (h *Handler) runVolume(w http.ResponseWriter, r *http.Request) {
	var req VolumeRunRequest
	if err := decode(r, &req); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if req.PackID == "" {
		apiError(w, 400, "pack_id required")
		return
	}
	if req.Iterations < 1 {
		req.Iterations = 1
	}
	if req.Iterations > 1000 {
		req.Iterations = 1000
	}
	if req.Concurrency < 1 {
		req.Concurrency = 1
	}
	if req.Concurrency > 20 {
		req.Concurrency = 20
	}

	cases, err := h.loadCases(r.Context(), req.PackID)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	if len(cases) == 0 {
		apiError(w, 400, "pack has no test cases")
		return
	}

	// SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(200)

	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Now().Add(30 * time.Minute))

	flusher, canFlush := w.(http.Flusher)
	sendEvent := func(ev VolumeEvent) {
		b, _ := json.Marshal(ev)
		fmt.Fprintf(w, "data: %s\n\n", b)
		if canFlush {
			flusher.Flush()
		}
	}

	ctx := r.Context()
	overallStart := time.Now()

	sem := make(chan struct{}, req.Concurrency)
	resultsCh := make(chan IterationResult, req.Iterations)
	stopped := make(chan struct{})
	var stopOnce sync.Once

	var wg sync.WaitGroup
	client := &http.Client{Timeout: 30 * time.Second}

	dispatchLoop:
	for i := 0; i < req.Iterations; i++ {
		select {
		case <-ctx.Done():
			break dispatchLoop
		case <-stopped:
			break dispatchLoop
		default:
		}

		sem <- struct{}{}
		wg.Add(1)
		go func(iter int) {
			defer wg.Done()
			defer func() { <-sem }()

			select {
			case <-ctx.Done():
				return
			case <-stopped:
				return
			default:
			}

			iterStart := time.Now()
			var caseResults []CaseResult
			iterStatus := "pass"

			for j, tc := range cases {
				var cr CaseResult
				if tc.Type == "sftp" {
					cr = h.runSFTPCase(tc)
				} else {
					cr = runCase(client, tc)
				}

				if !req.SkipWaits && tc.WaitSeconds > 0 && j < len(cases)-1 {
					cr.WaitedSeconds = tc.WaitSeconds
					select {
					case <-time.After(time.Duration(tc.WaitSeconds) * time.Second):
					case <-ctx.Done():
						return
					case <-stopped:
						return
					}
				}

				caseResults = append(caseResults, cr)
				if cr.Status != "pass" {
					iterStatus = "fail"
				}
			}

			res := IterationResult{
				Iteration:  iter + 1,
				Status:     iterStatus,
				DurationMs: time.Since(iterStart).Milliseconds(),
				Cases:      caseResults,
			}
			resultsCh <- res

			if req.StopOnFail && iterStatus == "fail" {
				stopOnce.Do(func() { close(stopped) })
			}
		}(i)
	}

	// Close channel once all goroutines finish
	go func() {
		wg.Wait()
		close(resultsCh)
	}()

	// Stream results
	passed := 0
	failed := 0
	totalMs := int64(0)
	minMs := int64(-1)
	maxMs := int64(0)

	streamLoop:
	for {
		select {
		case <-ctx.Done():
			break streamLoop
		case res, ok := <-resultsCh:
			if !ok {
				break streamLoop
			}
			if res.Status == "pass" {
				passed++
			} else {
				failed++
			}
			totalMs += res.DurationMs
			if minMs < 0 || res.DurationMs < minMs {
				minMs = res.DurationMs
			}
			if res.DurationMs > maxMs {
				maxMs = res.DurationMs
			}
			sendEvent(VolumeEvent{Type: "progress", Result: &res})
		}
	}

	total := passed + failed
	var avgMs float64
	if total > 0 {
		avgMs = float64(totalMs) / float64(total)
	}
	if minMs < 0 {
		minMs = 0
	}

	summary := VolumeSummary{
		Total:       total,
		Passed:      passed,
		Failed:      failed,
		AvgMs:       avgMs,
		MinMs:       minMs,
		MaxMs:       maxMs,
		TotalTimeMs: time.Since(overallStart).Milliseconds(),
	}
	sendEvent(VolumeEvent{Type: "done", Summary: &summary})
}
