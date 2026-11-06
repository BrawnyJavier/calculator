import { describe, expect, it } from 'vitest'
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

const succeeded = (state: CalculatorState, response: Parameters<typeof calculatorReducer>[1] & { type: 'requestSucceeded' }) =>
  calculatorReducer(calculatorReducer(state, { type: 'requestStarted' }), response)

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
  const response = { operation: 'divide', a: 10, b: 4, result: 2.5 } as const

  it('shows the result and the full expression', () => {
    const s = succeeded(type('10/4'), { type: 'requestSucceeded', response })
    expect(s).toMatchObject({ display: '2.5', isResult: true, overwrite: true, operation: null, status: 'ready', expression: '10 ÷ 4 =' })
  })

  it('keeps the exact result for further calculations', () => {
    const s = succeeded(type('1/3'), { type: 'requestSucceeded', response: { operation: 'divide', a: 1, b: 3, result: 1 / 3 } })
    expect(type('*', s).operand).toBe(1 / 3)
  })

  it('starts a new calculation when a digit follows a result', () => {
    const s = type('7', succeeded(type('10/4'), { type: 'requestSucceeded', response }))
    expect(s).toMatchObject({ display: '7', isResult: false, expression: '' })
  })

  it('continues from the result when an operator follows it', () => {
    const s = type('+', succeeded(type('10/4'), { type: 'requestSucceeded', response }))
    // Still flagged as a result, so the display keeps showing it rounded.
    expect(s).toMatchObject({ operand: 2.5, operation: 'add', expression: '2.5 +', isResult: true })
    expect(type('3', s).isResult).toBe(false)
  })

  it('applies √ to the right operand and keeps the pending operation', () => {
    const s = succeeded(type('9+16'), {
      type: 'requestSucceeded',
      response: { operation: 'sqrt', a: 16, result: 4 },
    })
    expect(s).toMatchObject({ display: '4', operand: 9, operation: 'add', entered: true, expression: '9 +' })
    expect(buildRequest(s)).toEqual({ operation: 'add', a: 9, b: 4 })
  })

  it('ignores input while loading', () => {
    const loading = calculatorReducer(type('1+2'), { type: 'requestStarted' })
    expect(loading.status).toBe('loading')
    expect(type('5', loading)).toBe(loading)
    expect(calculatorReducer(loading, { type: 'clear' })).toBe(loading)
  })
})

describe('errors', () => {
  const failed = calculatorReducer(calculatorReducer(type('1/0'), { type: 'requestStarted' }), {
    type: 'requestFailed',
    message: 'Cannot divide by zero',
  })

  it('shows the message and keeps the attempted expression', () => {
    expect(failed).toMatchObject({ status: 'error', error: 'Cannot divide by zero', expression: '1 ÷', operation: null })
  })

  it('starts fresh on the next digit or decimal point', () => {
    expect(type('8', failed)).toMatchObject({ display: '8', status: 'ready', error: null, expression: '' })
    expect(type('.', failed)).toMatchObject({ display: '0.', status: 'ready' })
  })

  it('clears on backspace and ignores operators and ±', () => {
    expect(type('<', failed)).toEqual(initialState)
    expect(type('+', failed)).toBe(failed)
    expect(type('~', failed)).toBe(failed)
  })
})
