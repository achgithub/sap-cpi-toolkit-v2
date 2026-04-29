package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type ScheduledJob struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	Type            string     `json:"type"` // "http" | "test_pack"
	IntervalSeconds int        `json:"interval_seconds"`
	Config          JobConfig  `json:"config"`
	Enabled         bool       `json:"enabled"`
	LastRunAt       *time.Time `json:"last_run_at"`
	LastStatus      *string    `json:"last_status"`
	LastError       *string    `json:"last_error"`
	CreatedAt       time.Time  `json:"created_at"`
}

type JobConfig struct {
	// HTTP job
	URL     string            `json:"url,omitempty"`
	Method  string            `json:"method,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
	// Test pack job
	PackID    string `json:"pack_id,omitempty"`
	SkipWaits bool   `json:"skip_waits,omitempty"`
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

type Scheduler struct {
	pool *pgxpool.Pool
	log  *slog.Logger
	mu   sync.Mutex
	jobs map[string]context.CancelFunc // id → cancel running goroutine
	ctx  context.Context
	h    *Handler // for running test pack jobs
}

func NewScheduler(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) *Scheduler {
	return &Scheduler{
		pool: pool,
		log:  log,
		jobs: make(map[string]context.CancelFunc),
		ctx:  ctx,
	}
}

// Start loads all enabled jobs from DB and starts their goroutines.
func (s *Scheduler) Start() {
	rows, err := s.pool.Query(s.ctx, `
		SELECT id, name, type, interval_seconds, config, enabled,
		       last_run_at, last_status, last_error, created_at
		FROM scheduled_jobs WHERE enabled = true`)
	if err != nil {
		s.log.Error("scheduler: load jobs", "error", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		job, err := scanJob(rows)
		if err == nil {
			s.schedule(job)
		}
	}
	s.log.Info("scheduler started", "jobs", len(s.jobs))
}

// schedule spawns a goroutine for a job, cancelling any prior goroutine for the same id.
func (s *Scheduler) schedule(job ScheduledJob) {
	ctx, cancel := context.WithCancel(s.ctx)
	s.mu.Lock()
	if prev, ok := s.jobs[job.ID]; ok {
		prev()
	}
	s.jobs[job.ID] = cancel
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.jobs, job.ID)
			s.mu.Unlock()
		}()

		// Delay first run: if never run, start after 15s (settle time);
		// otherwise wait until lastRun + interval is due.
		var initialWait time.Duration
		if job.LastRunAt == nil {
			initialWait = 15 * time.Second
		} else {
			next := job.LastRunAt.Add(time.Duration(job.IntervalSeconds) * time.Second)
			initialWait = time.Until(next)
			if initialWait < 0 {
				initialWait = 0
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(initialWait):
		}

		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			s.execute(ctx, job.ID)

			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Duration(job.IntervalSeconds) * time.Second):
			}
		}
	}()
}

// cancel stops a running job goroutine without deleting the DB record.
func (s *Scheduler) cancel(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if fn, ok := s.jobs[id]; ok {
		fn()
		delete(s.jobs, id)
	}
}

// IsRunning reports whether a job goroutine is active.
func (s *Scheduler) IsRunning(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.jobs[id]
	return ok
}

// execute runs one iteration of a job and updates last_run_at / last_status in DB.
func (s *Scheduler) execute(ctx context.Context, id string) {
	var job ScheduledJob
	var cfgBytes []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, type, interval_seconds, config, enabled,
		       last_run_at, last_status, last_error, created_at
		FROM scheduled_jobs WHERE id = $1`, id).
		Scan(&job.ID, &job.Name, &job.Type, &job.IntervalSeconds, &cfgBytes,
			&job.Enabled, &job.LastRunAt, &job.LastStatus, &job.LastError, &job.CreatedAt)
	if err != nil || !job.Enabled {
		return
	}
	json.Unmarshal(cfgBytes, &job.Config) //nolint:errcheck

	status, jobErr := s.run(ctx, job)

	var errPtr *string
	if jobErr != "" {
		errPtr = &jobErr
	}
	now := time.Now()
	s.pool.Exec(ctx, `
		UPDATE scheduled_jobs
		SET last_run_at=$2, last_status=$3, last_error=$4
		WHERE id=$1`, id, now, status, errPtr) //nolint:errcheck

	s.log.Info("scheduler: job fired", "id", id, "name", job.Name, "status", status)
}

// run executes the job payload and returns (status, errorMsg).
func (s *Scheduler) run(ctx context.Context, job ScheduledJob) (string, string) {
	switch job.Type {
	case "test_pack":
		return s.runPackJob(ctx, job)
	default:
		return s.runHTTPJob(ctx, job)
	}
}

func (s *Scheduler) runHTTPJob(ctx context.Context, job ScheduledJob) (string, string) {
	if job.Config.URL == "" {
		return "error", "url not configured"
	}
	method := job.Config.Method
	if method == "" {
		method = "POST"
	}
	var bodyReader io.Reader
	if job.Config.Body != "" {
		bodyReader = strings.NewReader(job.Config.Body)
	}
	req, err := http.NewRequestWithContext(ctx, method, job.Config.URL, bodyReader)
	if err != nil {
		return "error", err.Error()
	}
	for k, v := range job.Config.Headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "error", err.Error()
	}
	resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return "pass", ""
	}
	return "fail", resp.Status
}

func (s *Scheduler) runPackJob(ctx context.Context, job ScheduledJob) (string, string) {
	if s.h == nil || job.Config.PackID == "" {
		return "error", "pack_id not configured"
	}
	cases, err := s.h.loadCases(ctx, job.Config.PackID)
	if err != nil || len(cases) == 0 {
		return "error", "could not load test cases"
	}

	client := &http.Client{Timeout: 30 * time.Second}
	failed := 0
	for i, tc := range cases {
		var cr CaseResult
		if tc.Type == "sftp" {
			cr = s.h.runSFTPCase(tc)
		} else {
			cr = runCase(client, tc)
		}
		if cr.Status != "pass" {
			failed++
		}
		if !job.Config.SkipWaits && tc.WaitSeconds > 0 && i < len(cases)-1 {
			select {
			case <-time.After(time.Duration(tc.WaitSeconds) * time.Second):
			case <-ctx.Done():
				return "error", "cancelled"
			}
		}
	}
	if failed > 0 {
		return "fail", ""
	}
	return "pass", ""
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type scannable interface {
	Scan(dest ...any) error
}

func scanJob(row scannable) (ScheduledJob, error) {
	var job ScheduledJob
	var cfgBytes []byte
	err := row.Scan(&job.ID, &job.Name, &job.Type, &job.IntervalSeconds, &cfgBytes,
		&job.Enabled, &job.LastRunAt, &job.LastStatus, &job.LastError, &job.CreatedAt)
	if err != nil {
		return job, err
	}
	json.Unmarshal(cfgBytes, &job.Config) //nolint:errcheck
	return job, nil
}

// ── HTTP Handlers ─────────────────────────────────────────────────────────────

func (h *Handler) listScheduledJobs(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, name, type, interval_seconds, config, enabled,
		       last_run_at, last_status, last_error, created_at
		FROM scheduled_jobs ORDER BY created_at DESC`)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	jobs := []ScheduledJob{}
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			continue
		}
		jobs = append(jobs, job)
	}
	jsonResp(w, 200, jobs)
}

func (h *Handler) createScheduledJob(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name            string    `json:"name"`
		Type            string    `json:"type"`
		IntervalSeconds int       `json:"interval_seconds"`
		Config          JobConfig `json:"config"`
		Enabled         bool      `json:"enabled"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.IntervalSeconds < 60 {
		body.IntervalSeconds = 60
	}
	if body.Type == "" {
		body.Type = "http"
	}

	cfgBytes, _ := json.Marshal(body.Config)
	var job ScheduledJob
	var cfgOut []byte
	err := h.pool.QueryRow(r.Context(), `
		INSERT INTO scheduled_jobs (name, type, interval_seconds, config, enabled)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, name, type, interval_seconds, config, enabled,
		          last_run_at, last_status, last_error, created_at`,
		body.Name, body.Type, body.IntervalSeconds, cfgBytes, body.Enabled,
	).Scan(&job.ID, &job.Name, &job.Type, &job.IntervalSeconds, &cfgOut,
		&job.Enabled, &job.LastRunAt, &job.LastStatus, &job.LastError, &job.CreatedAt)
	if err != nil {
		h.log.Error("create scheduled job", "error", err)
		apiError(w, 500, "internal error")
		return
	}
	json.Unmarshal(cfgOut, &job.Config) //nolint:errcheck

	if job.Enabled {
		h.sched.schedule(job)
	}
	jsonResp(w, 201, job)
}

func (h *Handler) updateScheduledJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Name            string    `json:"name"`
		Type            string    `json:"type"`
		IntervalSeconds int       `json:"interval_seconds"`
		Config          JobConfig `json:"config"`
		Enabled         bool      `json:"enabled"`
	}
	if err := decode(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		apiError(w, 400, "name is required")
		return
	}
	if body.IntervalSeconds < 60 {
		body.IntervalSeconds = 60
	}

	cfgBytes, _ := json.Marshal(body.Config)
	tag, err := h.pool.Exec(r.Context(), `
		UPDATE scheduled_jobs
		SET name=$2, type=$3, interval_seconds=$4, config=$5, enabled=$6
		WHERE id=$1`,
		id, body.Name, body.Type, body.IntervalSeconds, cfgBytes, body.Enabled)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "job not found")
		return
	}

	// Restart or stop scheduler goroutine based on enabled state.
	if body.Enabled {
		job := ScheduledJob{ID: id, Name: body.Name, Type: body.Type,
			IntervalSeconds: body.IntervalSeconds, Config: body.Config, Enabled: true}
		h.sched.schedule(job)
	} else {
		h.sched.cancel(id)
	}
	w.WriteHeader(204)
}

func (h *Handler) deleteScheduledJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	h.sched.cancel(id)
	tag, err := h.pool.Exec(r.Context(), `DELETE FROM scheduled_jobs WHERE id=$1`, id)
	if err != nil || tag.RowsAffected() == 0 {
		apiError(w, 404, "job not found")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) triggerScheduledJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	go h.sched.execute(context.Background(), id)
	w.WriteHeader(204)
}

func (h *Handler) schedulerStatus(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, name, type, interval_seconds, config, enabled,
		       last_run_at, last_status, last_error, created_at
		FROM scheduled_jobs ORDER BY created_at DESC`)
	if err != nil {
		apiError(w, 500, "internal error")
		return
	}
	defer rows.Close()

	type statusJob struct {
		ScheduledJob
		ActiveGoroutine bool `json:"active_goroutine"`
	}

	jobs := []statusJob{}
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			continue
		}
		jobs = append(jobs, statusJob{job, h.sched.IsRunning(job.ID)})
	}
	jsonResp(w, 200, jobs)
}
