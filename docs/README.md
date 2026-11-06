# Implementation Plan — Index

Full-stack calculator: React + TypeScript frontend, Go REST backend.
Source: the assignment brief. Target effort: **~3 h** (budget 2–4 h).

> **Status: implemented.** These documents are the plan the work followed, kept as written so the process is
> visible. Where the build departed from the plan, the phase document says so in an **Outcome** note, and
> [Plan vs. outcome](#plan-vs-outcome) below lists every deviation. The root [README](../README.md) describes
> the finished project.

Guiding principles: correctness, simplicity, maintainability. No databases, auth, queues, frameworks or
abstractions the problem doesn't need. Each phase is independently reviewable and ends with a commit.

## Phases

| # | Phase | Doc | Budget |
|---|---|---|---|
| 1 | Backend — domain logic | [backend/phase-1-domain.md](backend/phase-1-domain.md) | 25 min |
| 2 | Backend — HTTP API | [backend/phase-2-http-api.md](backend/phase-2-http-api.md) | 30 min |
| 3 | Backend — server entrypoint | [backend/phase-3-server.md](backend/phase-3-server.md) | 15 min |
| 4 | Frontend — scaffold & tooling | [frontend/phase-4-scaffold.md](frontend/phase-4-scaffold.md) | 15 min |
| 5 | Frontend — logic & API client | [frontend/phase-5-logic-and-client.md](frontend/phase-5-logic-and-client.md) | 25 min |
| 6 | Frontend — UI | [frontend/phase-6-ui.md](frontend/phase-6-ui.md) | 40 min |
| 7 | Packaging, docs & final verification | [delivery/phase-7-packaging-and-docs.md](delivery/phase-7-packaging-and-docs.md) | 45 min |

Phases 1–3 and 4–6 only meet at the API contract below, so the frontend can be built against it before
the backend is finished (component tests mock the client).

## Environment (as inspected)

- Present: Node 22.14, npm, GNU Make 3.81, Homebrew, `gh`.
- **Missing: Go** → `brew install go` in Phase 1.
- **Missing: Docker** → Dockerfile is optional; written in Phase 7 but only build-verified if Docker/Colima is installed.

## Target project structure

```
calculator/
├── backend/
│   ├── go.mod                          # stdlib only
│   ├── cmd/server/main.go              # wiring, env config, graceful shutdown
│   └── internal/
│       ├── calculator/                 # pure domain logic, no HTTP
│       │   ├── calculator.go
│       │   └── calculator_test.go
│       └── api/                        # HTTP transport
│           ├── handler.go
│           └── handler_test.go
├── frontend/                           # Vite react-ts
│   └── src/
│       ├── main.tsx, App.tsx, index.css
│       ├── operations.ts               # op metadata: id, label, symbol, arity
│       ├── validation.ts (+ .test.ts)
│       ├── api.ts (+ .test.ts)
│       └── components/Calculator.tsx (+ .test.tsx)
├── docs/                               # this plan
├── Dockerfile                          # node build → go build → distroless
├── Makefile
├── README.md
├── PROMPTS.md
└── .github/workflows/ci.yml
```

## API contract (shared by all phases)

One endpoint with an `operation` field — a single table-driven code path, trivially extensible — instead
of seven near-identical endpoints.

### `POST /api/v1/calculate`

Request (`Content-Type: application/json`):

```json
{ "operation": "divide", "a": 10, "b": 4 }
{ "operation": "sqrt", "a": 16 }
```

Success — `200 OK`:

```json
{ "operation": "divide", "a": 10, "b": 4, "result": 2.5 }
```

Error body — always the same shape:

```json
{ "error": { "code": "division_by_zero", "message": "cannot divide by zero" } }
```

| Case | Status | `code` |
|---|---|---|
| Malformed JSON, unknown field, wrong type, body > 1 KB, trailing data | 400 | `invalid_request` |
| Unknown operation | 400 | `unknown_operation` |
| Missing `a`, or missing `b` for a binary op | 400 | `missing_operand` |
| `b` supplied for `sqrt` | 400 | `unexpected_operand` |
| Square root of a negative number | 422 | `invalid_domain` |
| Division by zero, including 0 raised to a negative power | 422 | `division_by_zero` |
| Result is ±Inf or NaN (overflow, e.g. `1e308 * 10`; `(-8) ^ 0.5`) | 422 | `result_out_of_range` |
| Unknown path | 404 | `not_found` |
| Wrong HTTP method | 405 | `method_not_allowed` (+ `Allow` header) |
| `Content-Type` is not `application/json` | 415 | `unsupported_media_type` |

Rationale: 400 = the request itself is malformed; 422 = well-formed request whose math is undefined.

### Operations

| `operation` | Arity | Semantics |
|---|---|---|
| `add` | 2 | a + b |
| `subtract` | 2 | a − b |
| `multiply` | 2 | a × b |
| `divide` | 2 | a ÷ b |
| `power` | 2 | aᵇ |
| `sqrt` | 1 | √a |
| `percent` | 2 | **a % of b** = a × b / 100 (e.g. 15 % of 200 = 30) |

### `GET /healthz` → `200 {"status":"ok"}`

## Cross-cutting decisions

- **Numbers are `float64` / JS `number`.** IEEE-754 artifacts (`0.1 + 0.2`) are an accepted, documented
  trade-off; a decimal library is not justified for this scope.
- **No CORS.** Dev uses the Vite proxy (`/api` → `:8080`); Docker serves frontend and API from one origin.
- **Validation split.** Frontend checks input *shape* for fast feedback; the backend is authoritative for
  all rules (it must be — any client can call it).
- **Dependencies.** Go: stdlib only. Frontend runtime: `react`, `react-dom`. Frontend dev: Vite,
  TypeScript, Vitest + coverage-v8, jsdom, Testing Library (react, user-event, jest-dom), and the template's
  linter (oxlint in the current Vite template, not ESLint).
- **Out of scope:** persistence, auth, history, E2E browser tests, expression parsing with precedence.

## Plan vs. outcome

| Area | Plan | What was built, and why |
|---|---|---|
| UI | Form: input A, operation, input B, Calculate | A pocket-calculator keypad. The form worked but did not look or feel like a calculator. The keypad state lives in a pure reducer (`calculatorState.ts`) with its own tests, and the backend still does every calculation. |
| Validation | `parseOperand` + `validateInputs` | Only `parseOperand`; with a keypad there are no free-text fields to validate. |
| Linter | Template ESLint | oxlint, which the current Vite template ships. |
| 404 / 405 | ServeMux plain-text defaults | JSON bodies, so every response follows the error contract. |
| Content-Type | Not checked | 415 for non-JSON bodies. |
| `0 ^ -1` | `result_out_of_range` | `division_by_zero`, which is what it is. |
| Server tests | None (`main.go` was thin) | `run()` is tested: API, static files, graceful shutdown, busy port. |
| Static files | `http.FileServer` | Same, without directory listings. |
| Layout | One breakpoint, centred card | Scales continuously with the window; full screen on phones and tablets. |
