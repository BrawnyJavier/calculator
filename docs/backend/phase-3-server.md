# Phase 3 — Backend: Server Entrypoint

**Budget:** 15 min · **Depends on:** Phase 2

## Goal
A small, production-sensible `main` that wires the handler into an `http.Server`, reads configuration
from the environment, optionally serves the built frontend, and shuts down gracefully.

## Scope
- **In:** `cmd/server/main.go`, env config, timeouts, structured logging, graceful shutdown, static files.
- **Out:** TLS, metrics, config files/flags libraries, CORS (not needed — see index).

## Files
- `backend/cmd/server/main.go`

## Design
- Config from env with defaults:
  - `PORT` (default `8080`)
  - `STATIC_DIR` (optional) — if set, `mux.Handle("/", http.FileServer(http.Dir(dir)))` so one process
    serves the SPA and the API from the same origin (used by the Dockerfile in Phase 7).
- To mount static files alongside the API, `main` creates a top-level `http.ServeMux`, mounts
  `api.NewHandler(logger)` on `/api/` and `/healthz`, and the file server on `/`.
- Logger: `slog.New(slog.NewJSONHandler(os.Stdout, nil))`.
- `http.Server` with `ReadHeaderTimeout: 5s`, `ReadTimeout: 10s`, `WriteTimeout: 10s`, `IdleTimeout: 60s`.
- Graceful shutdown: `signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)`; on signal call
  `srv.Shutdown` with a 5 s timeout. `ListenAndServe` returning `http.ErrServerClosed` is not an error.
- Keep `main` thin: a `run(ctx, getenv, stdout) error` function is enough to keep it readable; no DI container.

## Steps
1. Implement `main.go`.
2. `go build ./... && go run ./cmd/server`.
3. Smoke test:
   ```bash
   curl -s localhost:8080/healthz
   curl -s localhost:8080/api/v1/calculate -d '{"operation":"add","a":2,"b":3}'
   curl -s localhost:8080/api/v1/calculate -d '{"operation":"divide","a":1,"b":0}'
   ```
4. Ctrl-C → logs a clean shutdown, exit code 0.
5. Commit: `backend: add server entrypoint with graceful shutdown`.

## Tests
- No unit tests for `main` (pure wiring; behaviour is covered by Phase 2 tests and the smoke test above).
  This is called out in the README rather than padding coverage.

## Definition of done
- `go run ./cmd/server` serves the API on `:8080`; `PORT=9000` changes it.
- Smoke-test responses match the contract.
- `go vet ./...` clean; backend total coverage reported via `go test -coverprofile=coverage.out ./...`.
