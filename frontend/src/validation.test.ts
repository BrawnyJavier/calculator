import { describe, expect, it } from 'vitest'
import { parseOperand, validateInputs } from './validation'

describe('parseOperand', () => {
  it.each([
    ['42', 42],
    ['-7', -7],
    ['+7', 7],
    ['3.14', 3.14],
    ['.5', 0.5],
    ['-.5', -0.5],
    ['5.', 5],
    ['0', 0],
    ['1e3', 1000],
    ['2.5E-3', 0.0025],
    ['  12  ', 12],
  ])('accepts %j as %d', (raw, expected) => {
    expect(parseOperand(raw)).toEqual({ ok: true, value: expected })
  })

  it.each(['', '   '])('rejects empty input %j', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, error: 'Enter a number' })
  })

  it.each(['abc', '1.2.3', '1,000', '0x10', 'Infinity', 'NaN', '1e', '--1', '1 2', '.', '-'])(
    'rejects malformed input %j',
    (raw) => {
      expect(parseOperand(raw)).toEqual({ ok: false, error: 'Enter a valid number' })
    },
  )

  it('rejects numbers that overflow to Infinity', () => {
    expect(parseOperand('1e400')).toEqual({ ok: false, error: 'Number is too large' })
  })
})

describe('validateInputs', () => {
  it('builds a binary request', () => {
    expect(validateInputs('divide', '10', '4')).toEqual({
      ok: true,
      request: { operation: 'divide', a: 10, b: 4 },
    })
  })

  it('omits b for unary operations and ignores its content', () => {
    expect(validateInputs('sqrt', '16', 'not a number')).toEqual({
      ok: true,
      request: { operation: 'sqrt', a: 16 },
    })
  })

  it('leaves math rules such as division by zero to the backend', () => {
    expect(validateInputs('divide', '1', '0')).toEqual({
      ok: true,
      request: { operation: 'divide', a: 1, b: 0 },
    })
  })

  it('reports errors for both fields at once', () => {
    expect(validateInputs('add', '', 'x')).toEqual({
      ok: false,
      errors: { a: 'Enter a number', b: 'Enter a valid number' },
    })
  })

  it('reports only the invalid field', () => {
    expect(validateInputs('multiply', '2', '')).toEqual({
      ok: false,
      errors: { b: 'Enter a number' },
    })
  })

  it('reports an invalid a for unary operations', () => {
    expect(validateInputs('sqrt', 'abc', '')).toEqual({
      ok: false,
      errors: { a: 'Enter a valid number' },
    })
  })
})
