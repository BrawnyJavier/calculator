import { describe, expect, it } from 'vitest'
import type { CalculateResponse } from './api'
import {
  buildRequest,
  calculatorReducer,
  initialState,
  MAX_DIGITS,
  shouldChain,
  type CalculatorAction,
  type CalculatorState,
} from './calculatorState'

/** Applies keypad input like "12+3" (digits, ".", "~" for ±, "<" for ⌫). */
function type(input: string, state: CalculatorState = initialState): CalculatorState {
  const ops: Record<string, CalculatorAction> = {
    '+': { type: 'operator', operation: 'add' },
    '-': { type: 'operator', operation: 'subtract' },
    '*': { type: 'operator', operation: 'multiply' },
    '/': { type: 'operator', operation: 'divide' },
    '^': { type: 'operator', operation: 'power' },
    '%': { type: 'operator', operation: 'percent' },
    '.': { type: 'decimal' },
    '~': { type: 'toggleSign' },
    '<': { type: 'backspace' },
  }
  return [...input].reduce(
    (s, ch) => calculatorReducer(s, ops[ch] ?? { type: 'digit', digit: ch }),
    state,
  )
}

/** Starts the request "=" (or √) would send from `state`. */
function started(state: CalculatorState, unary?: 'sqrt'): CalculatorState {
  const request = buildRequest(state, unary)
  if (!request) throw new Error('nothing to calculate')
  return calculatorReducer(state, { type: 'requestStarted', request })
}

function succeeded(state: CalculatorState, result: number, unary?: 'sqrt'): CalculatorState {
  const loading = started(state, unary)
  const response: CalculateResponse = { ...loading.request!, result }
  return calculatorReducer(loading, { type: 'requestSucceeded', response })
}

const failed = (state: CalculatorState, message: string, unary?: 'sqrt') =>
  calculatorReducer(started(state, unary), { type: 'requestFailed', message })

describe('entering numbers', () => {
  it('starts at 0 and replaces the leading zero', () => {
    expect(initialState.display).toBe('0')
    expect(type('7').display).toBe('7')
    expect(type('007').display).toBe('7')
  })

  it('appends digits and a single decimal point', () => {
    expect(type('12.5').display).toBe('12.5')
    expect(type('1.2.3').display).toBe('1.23')
    expect(type('.').display).toBe('0.')
  })

  it(`limits entries to ${MAX_DIGITS} digits`, () => {
    expect(type('1'.repeat(MAX_DIGITS + 4)).display).toBe('1'.repeat(MAX_DIGITS))
  })

  it('toggles the sign, but not of zero', () => {
    expect(type('5~').display).toBe('-5')
    expect(type('5~~').display).toBe('5')
    expect(type('~').display).toBe('0')
    expect(type('0.~').display).toBe('-0.')
  })

  it('starts a negative right operand when ± follows an operator', () => {
    const s = type('12+~')
    expect(s).toMatchObject({ display: '-0', entered: true, expression: '12 +', operand: 12 })
    expect(buildRequest(type('5', s))).toEqual({ operation: 'add', a: 12, b: -5 })
  })

  it('negates a result and drops its now-wrong expression', () => {
    const s = type('~', succeeded(type('2+3'), 5))
    expect(s).toMatchObject({ display: '-5', expression: '', isResult: true })
    expect(type('*', s)).toMatchObject({ operand: -5, expression: '-5 ×' })
  })

  it('negates a √ result used as the right operand, keeping the pending operation', () => {
    const s = type('~', succeeded(type('9+16'), 4, 'sqrt'))
    expect(s).toMatchObject({ display: '-4', expression: '9 +', operation: 'add' })
    expect(buildRequest(s)).toEqual({ operation: 'add', a: 9, b: -4 })
  })

  it('replaces "-0" with the next digit', () => {
    const negativeZero = { ...initialState, display: '-0', overwrite: false }
    expect(type('4', negativeZero).display).toBe('-4')
  })

  it('backspaces to 0', () => {
    expect(type('123<').display).toBe('12')
    expect(type('5<').display).toBe('0')
    expect(type('5~<').display).toBe('0') // "-5" → "-" collapses to "0"
    expect(type('0<').display).toBe('0')
  })

  it('clears everything', () => {
    expect(calculatorReducer(type('12+3'), { type: 'clear' })).toEqual(initialState)
  })
})

describe('operators', () => {
  it('stores the left operand and shows the pending expression', () => {
    const s = type('12*')
    expect(s).toMatchObject({ operand: 12, operation: 'multiply', overwrite: true, entered: false, expression: '12 ×' })
    expect(s.display).toBe('12')
  })

  it('switches operator when no right operand has been entered', () => {
    expect(type('12+*')).toMatchObject({ operation: 'multiply', expression: '12 ×' })
  })

  it('starts the right operand fresh and keeps the expression', () => {
    expect(type('12*3')).toMatchObject({ display: '3', entered: true, expression: '12 ×' })
    expect(type('12*.')).toMatchObject({ display: '0.', entered: true, expression: '12 ×' })
  })

  it('formats percent and negative power bases', () => {
    expect(type('15%').expression).toBe('15 % of')
    expect(type('2~^').expression).toBe('(-2) ^')
  })
})

describe('requests', () => {
  it('builds a binary request on "="', () => {
    expect(buildRequest(type('10/4'))).toEqual({ operation: 'divide', a: 10, b: 4 })
  })

  it('uses the left operand twice for "5 × ="', () => {
    expect(buildRequest(type('5*'))).toEqual({ operation: 'multiply', a: 5, b: 5 })
  })

  it('builds a square root request from the display', () => {
    expect(buildRequest(type('16'), 'sqrt')).toEqual({ operation: 'sqrt', a: 16 })
  })

  it('returns null with nothing to calculate', () => {
    expect(buildRequest(type('42'))).toBeNull()
    expect(buildRequest({ ...initialState, status: 'loading' })).toBeNull()
    expect(buildRequest({ ...initialState, display: 'oops' }, 'sqrt')).toBeNull()
  })

  it('only chains once a right operand has been entered', () => {
    expect(shouldChain(type('2+'))).toBe(false)
    expect(shouldChain(type('2+3'))).toBe(true)
    expect(shouldChain(type('2'))).toBe(false)
  })
})

describe('results', () => {
  it('shows the result and the full expression', () => {
    const s = succeeded(type('10/4'), 2.5)
    expect(s).toMatchObject({ display: '2.5', isResult: true, overwrite: true, operation: null, status: 'ready', request: null, expression: '10 ÷ 4 =' })
  })

  it('keeps the exact result for further calculations', () => {
    expect(type('*', succeeded(type('1/3'), 1 / 3)).operand).toBe(1 / 3)
  })

  it('shows a result used as an operand rounded, as on the display', () => {
    const s = type('+', succeeded(type('.1+.2'), 0.1 + 0.2))
    expect(s).toMatchObject({ operand: 0.1 + 0.2, expression: '0.3 +' })
    expect(succeeded(type('5', s), 5.3).expression).toBe('0.3 + 5 =')
  })

  it('shows typed operands exactly, without rounding', () => {
    expect(succeeded(type('.1234567890123+1'), 1.1234567890123).expression).toBe('0.1234567890123 + 1 =')
  })

  it('starts a new calculation when a digit follows a result', () => {
    const s = type('7', succeeded(type('10/4'), 2.5))
    expect(s).toMatchObject({ display: '7', isResult: false, expression: '' })
  })

  it('continues from the result when an operator follows it', () => {
    const s = type('+', succeeded(type('10/4'), 2.5))
    // Still flagged as a result, so the display keeps showing it rounded.
    expect(s).toMatchObject({ operand: 2.5, operation: 'add', expression: '2.5 +', isResult: true })
    expect(type('3', s).isResult).toBe(false)
  })

  it('applies √ to the right operand and keeps the pending operation', () => {
    const s = succeeded(type('9+16'), 4, 'sqrt')
    expect(s).toMatchObject({ display: '4', operand: 9, operation: 'add', entered: true, expression: '9 +' })
    expect(buildRequest(s)).toEqual({ operation: 'add', a: 9, b: 4 })
    expect(succeeded(s, 13).expression).toBe('9 + 4 =')
  })

  it('ignores input while loading, except AC', () => {
    const loading = started(type('1+2'))
    expect(loading).toMatchObject({ status: 'loading', request: { operation: 'add', a: 1, b: 2 } })
    expect(type('5', loading)).toBe(loading)
    expect(type('~+<', loading)).toBe(loading)
    expect(calculatorReducer(loading, { type: 'clear' })).toEqual(initialState)
  })

  it('ignores a response that arrives after AC', () => {
    const cleared = calculatorReducer(started(type('1+2')), { type: 'clear' })
    const response = { operation: 'add', a: 1, b: 2, result: 3 } as const
    expect(calculatorReducer(cleared, { type: 'requestSucceeded', response })).toBe(cleared)
    expect(calculatorReducer(cleared, { type: 'requestFailed', message: 'late' })).toBe(cleared)
  })
})

describe('errors', () => {
  const divByZero = failed(type('1/0'), 'Cannot divide by zero')

  it('shows the message and the calculation that failed', () => {
    expect(divByZero).toMatchObject({ status: 'error', error: 'Cannot divide by zero', expression: '1 ÷ 0 =', operation: null, request: null })
  })

  it('shows a failed √ on the right operand as such, not as the dropped pending operation', () => {
    expect(failed(type('9+4~'), 'Negative', 'sqrt')).toMatchObject({ status: 'error', expression: '√(-4) =', operation: null })
  })

  it('starts fresh on the next digit or decimal point', () => {
    expect(type('8', divByZero)).toMatchObject({ display: '8', status: 'ready', error: null, expression: '' })
    expect(type('.', divByZero)).toMatchObject({ display: '0.', status: 'ready' })
  })

  it('clears on backspace and ignores operators and ±', () => {
    expect(type('<', divByZero)).toEqual(initialState)
    expect(type('+', divByZero)).toBe(divByZero)
    expect(type('~', divByZero)).toBe(divByZero)
  })
})
