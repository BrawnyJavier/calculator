# Phase 6 — Frontend: UI

> **Outcome:** built as planned first (commit "frontend: add calculator UI"), then replaced by a keypad
> calculator after a UI review: the form was correct but did not look or feel like a calculator. The keypad
> keeps the plan's principle — the backend does every calculation — and moves the input state machine into a
> pure, unit-tested reducer (`src/calculatorState.ts`). See the root [README](../../README.md#using-the-calculator)
> and [Plan vs. outcome](../README.md#plan-vs-outcome). The rest of this document is the original plan.

**Budget:** 40 min · **Depends on:** Phase 5 (Phase 3 for manual end-to-end check)

## Goal
An intuitive, accessible, responsive calculator UI that validates input, calls the backend, and shows
results and errors clearly.

## Scope
- **In:** `Calculator` component, `App` shell, CSS, component tests, manual browser check.
- **Out:** keypad/expression entry, history, theming toggles, routing, global state.

## Why a form, not a keypad
A keypad needs client-side expression parsing and a state machine — re-implementing the backend's job
in the browser. A form (A, operation, B) maps 1:1 to the API, is simpler to validate and test, and is
still quick to use. Documented in the README as a deliberate choice.

## Files
- `frontend/src/components/Calculator.tsx` + `Calculator.test.tsx`
- `frontend/src/App.tsx` — page heading + `<Calculator />`
- `frontend/src/index.css`

## Design
- Layout: `<form>` containing
  1. Input **A** (`<input type="text" inputMode="decimal">` with `<label>`) — text, not `type="number"`,
     so our validation controls the messages and browsers don't silently coerce.
  2. Operation selector — a `role="radiogroup"` of buttons from `OPERATIONS` (symbol visible, `aria-label`
     from `label`, `aria-pressed`/checked for the selected one).
  3. Input **B** — rendered only when the selected op has arity 2.
  4. **Calculate** submit button (disabled while loading). Enter submits natively.
  5. Output region with `aria-live="polite"`: the result (e.g. `10 ÷ 4 = 2.5`) or an error message
     (`role="alert"`). Field-level validation errors sit under each input with `aria-describedby`.
- State: plain `useState` — `a`, `b`, `operation`, `fieldErrors`, `result`, `error`, `loading`.
  No reducer/context; the state is small and local.
- Submit flow: `validateInputs` → on failure set field errors and stop → otherwise abort any previous
  request (`useRef<AbortController>`), call `calculate`, set result or `ApiError.message`; ignore
  `AbortError`; abort on unmount.
- Editing an input or switching operation clears stale result/error.
- Number display: `Number.toPrecision(12)` → `parseFloat` to trim float noise like `0.30000000000000004`
  in the UI only (the API returns the raw value).
- CSS: system font stack, CSS variables, a centered card `max-width: 28rem`, operation buttons in a
  wrapping grid, full-width inputs, ≥ 44 px touch targets, mobile-first with one breakpoint; respects
  `prefers-color-scheme`. No CSS framework.

## Steps
1. Build `Calculator.tsx` and `App.tsx`; replace Phase 4 smoke test.
2. Styles.
3. Component tests (below).
4. Manual check with the backend running (`go run ./cmd/server` + `npm run dev`): every operation,
   ÷0, √−4, empty/invalid input, rapid double submit, narrow (375 px) viewport, keyboard-only use.
5. `npm test && npm run lint && npm run build`.
6. Commit: `frontend: add calculator UI`.

## Tests (`Calculator.test.tsx`, `vi.mock('../api')`, `userEvent`)
- Renders inputs, all operation buttons, and the Calculate button.
- Selecting `√` hides input B; selecting `+` shows it again.
- Submitting empty/invalid input shows field errors and does **not** call the API.
- Valid submit calls `calculate` with the right payload (B omitted for sqrt) and shows the result.
- Shows the server error message when `calculate` rejects with `ApiError` (e.g. division by zero).
- Button is disabled and shows a loading state while the request is pending.
- Changing an input clears the previous result.

## Definition of done
- All tests pass; component coverage ≥ 90 %; frontend overall ≥ 90 %.
- Usable at 375 px width and via keyboard only; no console errors.
- `npm run build` produces `frontend/dist/` with no TS or lint errors.
