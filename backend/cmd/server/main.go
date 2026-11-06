// Command server runs the calculator HTTP service.
//
// Configuration is read from the environment:
//
//	PORT        port to listen on (default 8080)
//	STATIC_DIR  optional directory of built frontend assets to serve at /
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/BrawnyJavier/calculator/backend/internal/api"
)

const shutdownTimeout = 5 * time.Second

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, os.Getenv, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

// run starts the server and blocks until ctx is cancelled, then shuts down
// gracefully.
func run(ctx context.Context, getenv func(string) string, stdout io.Writer) error {
	logger := slog.New(slog.NewJSONHandler(stdout, nil))

	port := getenv("PORT")
	if port == "" {
		port = "8080"
	}

	var handler http.Handler = api.NewHandler(logger)
	if dir := getenv("STATIC_DIR"); dir != "" {
		mux := http.NewServeMux()
		mux.Handle("/api/", handler)
		mux.Handle("/healthz", handler)
		mux.Handle("/", http.FileServer(http.Dir(dir)))
		handler = mux
		logger.Info("serving static files", "dir", dir)
	}

	srv := &http.Server{
		Addr:              net.JoinHostPort("", port),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}

	// Bind before serving so a busy port fails fast and "listening" is only
	// logged once it is true.
	ln, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	logger.Info("server listening", "addr", ln.Addr().String())

	errCh := make(chan error, 1)
	go func() {
		if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	logger.Info("server stopped")
	return nil
}
