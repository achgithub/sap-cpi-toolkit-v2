package logging

import (
	"log/slog"
	"os"
)

// New returns a structured logger.
// Local env: text output at Debug level. All others: JSON at Info level.
func New(env string) *slog.Logger {
	if env == "local" {
		return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		}))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
}
