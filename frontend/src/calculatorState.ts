import type { CalculateRequest, CalculateResponse } from './api'
import { formatExpression, formatOperand, formatPending } from './format'
import type { BinaryOperation } from './operations'
import { parseOperand } from './validation'

/**
 * Maximum digits the user can type into a single entry. float64 represents
 * every 15-digit decimal exactly; a 16th digit could be silently changed
 * (9999999999999999 parses as 10000000000000000).
 */
export const MAX_DIGITS = 15

/**
 * Keypad state. The calculator works like a classic pocket calculator: one
 * binary operation at a time ("12 × 3 ="), with chaining ("2 + 3 + 4 ="),
 * and the backend performs every calculation.
 */
export interface CalculatorState {
  /** The current entry as typed, or a result as String(number). */
  display: string
  /** Whether `display` holds a computed result (shown rounded). */
  isResult: boolean
  /** Whether the next digit starts a new entry instead of appending. */
  overwrite: boolean
  /** Left operand of the pending binary operation. */
  operand: number | null
  /** `operand` as shown in the expression line (rounded if it was a result). */
  operandLabel: string
  operation: BinaryOperation | null
  /** Whether a right operand has been entered for the pending operation. */
  entered: boolean
  /** Secondary display line, e.g. "12 ×" or "12 × 3 =". */
  expression: string
  status: 'ready' | 'loading' | 'error'
  error: string | null
  /** The request in flight while status is 'loading'. */
  request: CalculateRequest | null
}

export const initialState: CalculatorState = {
  display: '0',
  isResult: false,
  overwrite: true,
  operand: null,
  operandLabel: '',
  operation: null,
  entered: false,
  expression: '',
  status: 'ready',
  error: null,
  request: null,
}

export type CalculatorAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operator'; operation: BinaryOperation }
  | { type: 'requestStarted'; request: CalculateRequest }
  | { type: 'requestSucceeded'; response: CalculateResponse }
  | { type: 'requestFailed'; message: string }

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  // Ignore input while a calculation is in flight, except AC: the caller
  // aborts the request, and AC is the way out of a slow or hung one.
  if (state.status === 'loading' && action.type !== 'clear' && action.type !== 'requestSucceeded' && action.type !== 'requestFailed') {
    return state
  }

  switch (action.type) {
    case 'digit': {
      const s = state.status === 'error' ? initialState : state
      if (s.overwrite) {
        return {
          ...s,
          display: action.digit,
          isResult: false,
          overwrite: false,
          entered: true,
          // A digit after "=" starts a new calculation.
          expression: s.operation ? s.expression : '',
        }
      }
      if (countDigits(s.display) >= MAX_DIGITS) return s
      const display = s.display === '0' ? action.digit : s.display === '-0' ? `-${action.digit}` : s.display + action.digit
      return { ...s, display }
    }

    case 'decimal': {
      const s = state.status === 'error' ? initialState : state
      if (s.overwrite) {
        return { ...s, display: '0.', isResult: false, overwrite: false, entered: true, expression: s.operation ? s.expression : '' }
      }
      if (s.display.includes('.')) return s
      return { ...s, display: `${s.display}.` }
    }

    case 'toggleSign': {
      if (state.status === 'error') return state
      // Right after an operator ("12 +"), ± starts the right operand as "-0",
      // so "12 + ± 5 =" is 12 + (-5); the left operand on screen is untouched.
      if (state.operation && !state.entered) {
        return { ...state, display: '-0', isResult: false, overwrite: false, entered: true }
      }
      if (state.display === '0') return state
      const display = state.display.startsWith('-') ? state.display.slice(1) : `-${state.display}`
      // Negating a result makes the old "2 + 3 =" line wrong, so drop it,
      // unless it is the pending "9 +" of an operation still in progress.
      return { ...state, display, expression: state.operation ? state.expression : '' }
    }

    case 'backspace': {
      if (state.status === 'error') return initialState
      if (state.overwrite) return state
      const trimmed = state.display.slice(0, -1)
      const display = trimmed === '' || trimmed === '-' ? '0' : trimmed
      return { ...state, display }
    }

    case 'clear':
      return initialState

    case 'operator': {
      if (state.status === 'error') return state
      // Changing your mind: "12 +" then "×" gives "12 ×".
      if (state.operation && state.operand !== null && !state.entered) {
        return { ...state, operation: action.operation, expression: formatPending(state.operandLabel, action.operation) }
      }
      const parsed = parseOperand(state.display)
      if (!parsed.ok) return state
      const operandLabel = formatOperand(parsed.value, state.isResult)
      return {
        ...state,
        operand: parsed.value,
        operandLabel,
        operation: action.operation,
        entered: false,
        overwrite: true,
        // isResult is kept, so a result stays rounded while it is the left operand.
        expression: formatPending(operandLabel, action.operation),
      }
    }

    case 'requestStarted':
      return { ...state, status: 'loading', error: null, request: action.request }

    case 'requestSucceeded': {
      if (state.status !== 'loading' || !state.request) return state
      const display = String(action.response.result)
      // √ applied to the right operand keeps the pending operation: "9 + √16" → "9 + 4".
      if (state.request.operation === 'sqrt' && state.operation) {
        return { ...state, display, isResult: true, overwrite: true, entered: true, status: 'ready', request: null }
      }
      return { ...initialState, display, isResult: true, expression: `${describe(state, state.request)} =` }
    }

    case 'requestFailed': {
      if (state.status !== 'loading' || !state.request) return state
      // Show what failed ("1 ÷ 0 =", "√(-4) ="); the pending operation is dropped.
      return { ...initialState, status: 'error', error: action.message, expression: `${describe(state, state.request)} =` }
    }
  }
}

/**
 * Builds the API request for "=" (or √ when `unary` is set) from the current
 * state, or returns null when there is nothing to calculate.
 */
export function buildRequest(state: CalculatorState, unary?: 'sqrt'): CalculateRequest | null {
  if (state.status !== 'ready') return null
  const value = parseOperand(state.display)
  if (!value.ok) return null

  if (unary === 'sqrt') {
    return { operation: 'sqrt', a: value.value }
  }
  if (!state.operation || state.operand === null) return null
  // "5 × =" uses the displayed value (the left operand) as the right one: 25.
  return { operation: state.operation, a: state.operand, b: value.value }
}

/** Whether pressing an operator must first evaluate the pending operation. */
export function shouldChain(state: CalculatorState): boolean {
  return state.operation !== null && state.entered
}

/**
 * Renders the calculation `request` performs, from what is on screen: the
 * entry on the display is always the request's last operand.
 */
function describe(state: CalculatorState, request: CalculateRequest): string {
  const entry = formatOperand(Number(state.display), state.isResult)
  return request.operation === 'sqrt'
    ? formatExpression('sqrt', entry)
    : formatExpression(request.operation, state.operandLabel, entry)
}

function countDigits(display: string): number {
  return display.replace(/[^0-9]/g, '').length
}
