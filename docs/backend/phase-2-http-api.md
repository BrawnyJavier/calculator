# Phase 2 — Backend: HTTP API

**Budget:** 30 min · **Depends on:** Phase 1 · **Contract:** [../README.md](../README.md#api-contract-shared-by-all-phases)

## Goal
An `http.Handler` that implements the REST contract exactly: strict request decoding, consistent JSON
responses, and a deterministic mapping from domain errors to HTTP status + error code.

## Scope
- **In:** `internal/api` package — routing, decoding, validation of request shape, error mapping, tests.
- **Out:** listening on a port, env config, static file serving (Phase 3).

## Files
- `backend/internal/api/handler.go`
- `backend/internal/api/handler_test.go`

## Design
- `func NewHandler(logger *slog.Logger) http.Handler` returns a `*http.ServeMux` with Go 1.22 method patterns:
  - `POST /api/v1/calculate`
  - `GET /healthz`
- Request / response types:
  ```go
  type calculateRequest struct {
      Operation string   `json:"operation"`
      A         *float64 `json:"a"`
      B         *float64 `json:"b,omitempty"`
  }
  type calculateResponse struct {
      Operation string   `json:"operation"`
      A         float64  `json:"a"`
      B         *float64 `json:"b,omitempty"`
      Result    float64  `json:"result"`
  }
  type errorResponse struct {
      Error struct{ Code, Message string } `json:"error"` // fields tagged code/message
  }
  ```
  Pointers distinguish "missing" from `0`.
- Decoding: `http.MaxBytesReader(w, r.Body, 1<<10)`, `json.Decoder` with `DisallowUnknownFields()`,
  then a second `Decode` must return `io.EOF` (rejects trailing data). Any decode failure → 400
  `invalid_request` with a short, non-leaky message.
- Missing `operation` or `a` → 400 (`unknown_operation` / `missing_operand`).
- Call `calculator.Calculate`; map errors with `errors.Is` in one small function:

  | Domain error | Status | Code |
  |---|---|---|
  | `ErrUnknownOperation` | 400 | `unknown_operation` |
  | `ErrMissingOperand` | 400 | `missing_operand` |
  | `ErrUnexpectedOperand` | 400 | `unexpected_operand` |
  | `ErrDivisionByZero` | 422 | `division_by_zero` |
  | `ErrNegativeSqrt` | 422 | `invalid_domain` |
  | `ErrNonFiniteResult` | 422 | `result_out_of_range` |
  | anything else | 500 | `internal_error` (logged, generic message) |

- Helpers `writeJSON(w, status, v)` and `writeError(w, status, code, msg)` set
  `Content-Type: application/json`.
- Content-Type of the request is not enforced beyond JSON decoding succeeding — keeps curl usage simple;
  noted in README.
- Log one line per error at `Warn` (4xx) / `Error` (5xx). No request-logging middleware.

## Steps
1. Implement handler and helpers.
2. Write tests (below), iterate until green.
3. `go vet ./... && go test -race -cover ./...`.
4. Commit: `backend: add calculate REST handler`.

## Tests (`handler_test.go`, `httptest.NewRecorder`, table-driven)
- 200 for every operation; body decodes to the expected `result`; `b` omitted in the sqrt response.
- 400 `invalid_request`: malformed JSON, empty body, unknown field, `"a": "5"` (wrong type),
  trailing data (`{...}{...}`), body > 1 KB.
- 400 `unknown_operation`: missing and unrecognised operation.
- 400 `missing_operand`: no `a`; binary op without `b`.
- 400 `unexpected_operand`: sqrt with `b`.
- 422: divide by zero, sqrt(-1), overflow.
- 405 for `GET /api/v1/calculate`; 404 for unknown path. *(Outcome: both now return the JSON error shape —
  `method_not_allowed` with an `Allow` header, and `not_found` — and a non-JSON `Content-Type` returns 415.)*
- `GET /healthz` → 200 `{"status":"ok"}`.
- Every response has `Content-Type: application/json`.
- Logger in tests: `slog.New(slog.NewTextHandler(io.Discard, nil))`.

## Definition of done
- All contract rows in the index have a passing test.
- Package coverage ≥ 90 %.
- Handler contains no arithmetic — only translation.
