package sapclient

import (
	"context"
	"time"

	"golang.org/x/time/rate"
)

// Category identifies which rate bucket applies to a request.
type Category int

const (
	CategoryMonitoring Category = iota
	CategoryOperations
	CategoryRead
)

type instanceLimiter struct {
	monitoring *rate.Limiter
	operations *rate.Limiter
	read       *rate.Limiter
}

// newLimiter creates token buckets for the three API categories.
// Burst sizes allow short bursts without blocking: monitoring×3, operations×2, read×5.
func newLimiter(monPerMin, opsPerMin, readPerMin int) *instanceLimiter {
	return &instanceLimiter{
		monitoring: rate.NewLimiter(rate.Every(time.Minute/time.Duration(monPerMin)), 3),
		operations: rate.NewLimiter(rate.Every(time.Minute/time.Duration(opsPerMin)), 2),
		read:       rate.NewLimiter(rate.Every(time.Minute/time.Duration(readPerMin)), 5),
	}
}

func (l *instanceLimiter) Wait(ctx context.Context, cat Category) error {
	switch cat {
	case CategoryMonitoring:
		return l.monitoring.Wait(ctx)
	case CategoryOperations:
		return l.operations.Wait(ctx)
	default:
		return l.read.Wait(ctx)
	}
}
