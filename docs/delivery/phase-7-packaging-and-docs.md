# Phase 7 — Packaging, Documentation & Final Verification

**Budget:** 45 min · **Depends on:** Phases 1–6

## Goal
Make the project trivial for a reviewer to run, test and understand: one-command workflows, an optional
single-container deployment, CI, and a README that covers every item the assignment asks for.

## Scope
- **In:** `Makefile`, `Dockerfile`, `.dockerignore`, GitHub Actions CI, root `README.md`, `PROMPTS.md`,
  coverage report, end-to-end verification.
- **Out:** docker-compose, Kubernetes, deployment to a cloud host, release automation.

## Files
- `Makefile`
- `Dockerfile`, `.dockerignore`
- `.github/workflows/ci.yml`
- `README.md`
- `PROMPTS.md`

## Makefile targets
| Target | Does |
|---|---|
| `run-backend` | `cd backend && go run ./cmd/server` |
| `run-frontend` | `cd frontend && npm run dev` |
| `test` | `go test -race ./...` + `npm test` |
| `coverage` | `go test -coverprofile=coverage.out ./... && go tool cover -html=… -o coverage.html` + `npm run coverage` |
| `lint` | `go vet ./...` + `npm run lint` |
| `docker` | `docker build -t calculator . && docker run --rm -p 8080:8080 calculator` |

## Dockerfile (multi-stage, one image serves UI + API)
1. `node:22-alpine` → `npm ci && npm run build` → `frontend/dist`.
2. `golang:<version>-alpine` → `CGO_ENABLED=0 go build -o /server ./cmd/server`.
3. `gcr.io/distroless/static-debian12:nonroot` → copy `/server` and `dist` to `/app/static`;
   `ENV STATIC_DIR=/app/static PORT=8080`; `EXPOSE 8080`; `USER nonroot`.
- Pin base image versions. `.dockerignore`: `node_modules`, `dist`, `coverage*`, `.git`.
- **Docker is not installed on the dev machine** — if it stays that way, README states the Dockerfile
  is unverified locally and CI builds it instead.

## CI (`.github/workflows/ci.yml`)
- On push/PR: job `backend` (setup-go, `go vet`, `go test -race -cover`), job `frontend`
  (setup-node, `npm ci`, lint, test with coverage, build), job `docker` (`docker build` only).
- Small and fast; it's a reviewer signal, not infrastructure.

## README outline
1. Overview + screenshot.
2. Prerequisites (Go, Node 22, optional Docker).
3. Quick start — backend, frontend, Docker; `make` shortcuts.
4. API reference — endpoint, operations table, error table, curl examples (success, ÷0, invalid JSON,
   sqrt) with real output captured from the running server.
5. Testing & coverage — commands + coverage summary table (backend per package, frontend overall).
6. Design decisions & assumptions — single endpoint; 400 vs 422; `percent` = a % of b; float64 trade-off;
   stdlib-only Go; form UI vs keypad; validation split; no CORS via proxy/same origin; what was
   deliberately left out and what I'd add next (rate limiting, OpenAPI spec, E2E tests, history).
7. Project structure.
8. AI usage — pointer to `PROMPTS.md`.

## PROMPTS.md
The assignment requires sharing prompts. List the prompts used in order (planning, each phase,
reviews), with a one-line note on what was accepted, changed or rejected — shows judgement over the tool.

## Final verification
1. Fresh-clone simulation: `git clean -xdf -n` review, then follow README from scratch.
2. `make lint test coverage` all green; record coverage numbers.
3. Run both services; exercise every operation and error case in the browser (desktop + 375 px).
4. Execute every README curl example and confirm outputs match the text.
5. `docker build`/`run` if Docker available; otherwise confirm CI docker job passes after push.
6. Self-review of the full diff (or `/code-review`) for dead code, naming, and comments.
7. Commits: `chore: add Makefile, Dockerfile and CI`, `docs: add README and PROMPTS`.
8. Push to GitHub (`gh repo create` on request) and share the link.

## Definition of done
- Every "Deliverables" and "Make sure your README includes" item in the assignment brief is satisfied.
- A reviewer can go from clone to running app with ≤ 3 commands.
- All tests and lint pass locally and in CI.
