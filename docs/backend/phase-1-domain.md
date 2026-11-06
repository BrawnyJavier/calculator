# Phase 1 — Backend: Domain Logic

**Budget:** 25 min · **Depends on:** nothing · **Contract:** [../README.md](../README.md#api-contract-shared-by-all-phases)

## Goal
A pure, fully tested Go package that performs every calculator operation and reports domain errors.
No HTTP, no I/O — the transport layer (Phase 2) only translates to and from it.

## Scope
- **In:** repo bootstrap, Go install, `internal/calculator` package and its tests.
- **Out:** HTTP, JSON, logging, configuration.

## Files
- `.gitignore` (root) — `coverage.out`, `coverage.html`, `node_modules/`, `dist/`, `coverage/`, `.DS_Store`
- `backend/go.mod` — `module github.com/<user>/calculator/backend`, current Go version
- `backend/internal/calculator/calculator.go`
- `backend/internal/calculator/calculator_test.go`

## Steps
1. `brew install go`; confirm `go version`.
2. Root `.gitignore`; initial commit with `docs/`.
3. `cd backend && go mod init …`.
4. Implement `calculator.go`:
   - `type Operation string` with constants `Add`, `Subtract`, `Multiply`, `Divide`, `Power`, `Sqrt`, `Percent`
     (values match the API strings: `"add"`, `"subtract"`, …).
   - `func Arity(op Operation) (int, bool)` — `1` for `Sqrt`, `2` for the rest; `false` if unknown.
   - `func Calculate(op Operation, a float64, b *float64) (float64, error)`:
     - unknown op → `ErrUnknownOperation`
     - binary op with `b == nil` → `ErrMissingOperand`
     - `Sqrt` with `b != nil` → `ErrUnexpectedOperand`
     - `Divide` with `*b == 0` → `ErrDivisionByZero`
     - `Sqrt` with `a < 0` → `ErrNegativeSqrt`
     - result `math.IsInf` / `math.IsNaN` → `ErrNonFiniteResult`
   - Sentinel errors via `errors.New` in one `var (...)` block, messages lowercase per Go convention.
   - A `switch` on `op` is enough — no strategy interfaces or registries.
5. `go vet ./... && go test -race -cover ./...`.
6. Commit: `backend: add calculator domain package`.

## Tests (`calculator_test.go`, table-driven, `t.Run` per case)
- Happy path for every op, including negatives, decimals, zero operands, `0 ^ 0 = 1`, `percent(15, 200) = 30`.
- `divide(1, 0)` and `divide(0, 0)` → `ErrDivisionByZero` (checked with `errors.Is`).
- `sqrt(-4)` → `ErrNegativeSqrt`; `sqrt(0) = 0`.
- Overflow: `multiply(1e308, 10)`, `power(10, 400)` → `ErrNonFiniteResult`.
- NaN: `power(-8, 0.5)` → `ErrNonFiniteResult`.
- Missing / unexpected `b`; unknown operation.
- `Arity` for each op and an unknown one.
- Float comparisons use exact equality only where results are exact; otherwise a small epsilon helper.

## Definition of done
- `go test -race -cover ./...` passes with ~100 % coverage of the package.
- `go vet` clean; code is `gofmt`-ed.
- No dependencies outside the standard library.
