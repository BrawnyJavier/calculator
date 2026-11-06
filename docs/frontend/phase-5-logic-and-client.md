# Phase 5 — Frontend: Logic & API Client

**Budget:** 25 min · **Depends on:** Phase 4 · **Contract:** [../README.md](../README.md#api-contract-shared-by-all-phases)

## Goal
All non-visual frontend logic as small, pure, independently tested modules: operation metadata, input
validation, and a typed API client. The UI in Phase 6 becomes thin glue over these.

## Scope
- **In:** `operations.ts`, `validation.ts`, `api.ts` and their tests.
- **Out:** React components, styling.

## Files
- `frontend/src/operations.ts`
- `frontend/src/validation.ts` + `validation.test.ts`
- `frontend/src/api.ts` + `api.test.ts`

## Design

### `operations.ts`
```ts
export type Operation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'percent'
export interface OperationInfo { id: Operation; symbol: string; label: string; arity: 1 | 2 }
export const OPERATIONS: readonly OperationInfo[] = [ /* + − × ÷ xʸ √ % */ ]
export const getOperation = (id: Operation): OperationInfo => …
```
Single source of truth for UI buttons, accessible labels, and whether operand B is needed.

### `validation.ts`
- `parseOperand(raw: string): { value: number } | { error: string }`
  - trims; empty → "Enter a number"; `Number(raw)` NaN or non-finite → "Enter a valid number".
  - rejects inputs `Number()` accepts but users wouldn't mean (`"0x10"`, `"1e"`): accept only a plain
    decimal/scientific regex, e.g. `/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i`.
- *(Removed with the keypad redesign in Phase 6: there are no free-text fields left to validate.)*
  `validateInputs(op, rawA, rawB)` → `{ ok: true, request } | { ok: false, errors: { a?, b? } }`,
  ignoring `b` for unary ops.
- Shape only — no division-by-zero or negative-sqrt checks; the server is authoritative and its
  message is displayed (avoids duplicating rules in two places).

### `api.ts`
```ts
export interface CalculateRequest { operation: Operation; a: number; b?: number }
export interface CalculateResponse extends CalculateRequest { result: number }
export class ApiError extends Error { constructor(public code: string, message: string, public status?: number) }
export async function calculate(req: CalculateRequest, signal?: AbortSignal): Promise<CalculateResponse>
```
- `fetch('/api/v1/calculate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body, signal })`.
- `!res.ok` → parse `{error:{code,message}}`; if body isn't that shape → `ApiError('http_error', 'Request failed (status N)')`.
- Network failure (`TypeError`) → `ApiError('network_error', 'Could not reach the calculator service')`.
- `AbortError` is re-thrown untouched so the caller can ignore it.
- Base URL is relative — works with the Vite proxy and same-origin Docker; no env config needed.

## Steps
1. `operations.ts`.
2. `validation.ts` + tests.
3. `api.ts` + tests.
4. `npm test && npm run lint && npx tsc -b`.
5. Commit: `frontend: add operations, validation and API client`.

## Tests
- **validation:** valid ints/decimals/negatives/`.5`/`1e3`; empty, whitespace, `abc`, `1.2.3`, `0x10`,
  `Infinity`; unary op ignores `b`; binary op reports errors for both fields at once.
- **api** (`vi.stubGlobal('fetch', vi.fn())`): success returns parsed body; sends correct method/headers/body;
  422 error body → `ApiError` with server `code`/`message`/`status`; non-JSON 500 → generic `ApiError`;
  rejected fetch → `network_error`; aborted request propagates `AbortError`.

## Definition of done
- All three modules ≥ 95 % coverage; strict TS, no `any`.
- No React imports in these modules.
