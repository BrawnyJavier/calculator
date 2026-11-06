import type { CalculateRequest, CalculateResponse } from './api'
import { formatExpression, formatPending } from './format'
import type { BinaryOperation } from './operations'
import { parseOperand } from './validation'

/** Maximum digits the user can type into a single entry. */
export const MAX_DIGITS = 16

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
  operation: BinaryOperation | null
  /** Whether a right operand has been entered for the pending operation. */
  entered: boolean
  /** Secondary display line, e.g. "12 ×" or "12 × 3 =". */
  expression: string
  status: 'ready' | 'loading' | 'error'
  error: string | null
}

export const initialState: CalculatorState = {
  display: '0',
  isResult: false,
  overwrite: true,
  operand: null,
  operation: null,
  entered: false,
  expression: '',
  status: 'ready',
  error: null,
}

export type CalculatorAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operator'; operation: BinaryOperation }
  | { type: 'requestStarted' }
  | { type: 'requestSucceeded'; response: CalculateResponse }
  | { type: 'requestFailed'; message: string }

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  // Ignore input while a calculation is in flight.
  if (state.status === 'loading' && action.type !== 'requestSucceeded' && action.type !== 'requestFailed') {
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
      if (state.status === 'error' || state.display === '0') return state
      const display = state.display.startsWith('-') ? state.display.slice(1) : `-${state.display}`
      return { ...state, display }
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
        return { ...state, operation: action.operation, expression: formatPending(state.operand, action.operation) }
      }
      const parsed = parseOperand(state.display)
      if (!parsed.ok) return state
      return {
        ...state,
        operand: parsed.value,
        operation: action.operation,
        entered: false,
        overwrite: true,
        // isResult is kept, so a result stays rounded while it is the left operand.
        expression: formatPending(parsed.value, action.operation),
      }
    }

    case 'requestStarted':
      return { ...state, status: 'loading', error: null }

    case 'requestSucceeded': {
      const { response } = action
      const display = String(response.result)
      // √ applied to the right operand keeps the pending operation: "9 + √16" → "9 + 4".
      if (response.operation === 'sqrt' && state.operation) {
        return { ...state, display, isResult: true, overwrite: true, entered: true, status: 'ready' }
      }
      return {
        ...initialState,
        display,
        isResult: true,
        expression: `${formatExpression(response)} =`,
      }
    }

    case 'requestFailed':
      return { ...initialState, status: 'error', error: action.message, expression: state.expression }
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

function countDigits(display: string): number {
  return display.replace(/[^0-9]/g, '').length
}
