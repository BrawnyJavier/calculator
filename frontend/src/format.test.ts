import { describe, expect, it } from 'vitest'
import { capitalize, formatExpression, formatNumber, formatPending } from './format'

describe('formatNumber', () => {
  it.each([
    [2.5, '2.5'],
    [0.1 + 0.2, '0.3'],
    [-7, '-7'],
    [1 / 3, '0.333333333333'],
    [1024, '1024'],
    [1e21, '1e+21'],
    [1e-7, '1e-7'],
    [-0, '0'],
    [975461057789971100, '9.7546105779e+17'],
    [-0.000000123456789123, '-1.23456789123e-7'],
    [1234567890123456, '1.23456789012e+15'],
    [2 ** 40, '1.09951162778e+12'],
    [999999999999.9, '1e+12'],
    [-1234567890123, '-1.23456789012e+12'],
    [123456789012, '123456789012'],
    [1e15, '1000000000000000'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected)
  })
})

describe('formatExpression', () => {
  it.each([
    [{ operation: 'add', a: 2, b: 3, result: 5 }, '2 + 3'],
    [{ operation: 'subtract', a: 2, b: -3, result: 5 }, '2 − (-3)'],
    [{ operation: 'multiply', a: 6, b: 7, result: 42 }, '6 × 7'],
    [{ operation: 'divide', a: 10, b: 4, result: 2.5 }, '10 ÷ 4'],
    [{ operation: 'power', a: 2, b: 10, result: 1024 }, '2 ^ 10'],
    [{ operation: 'power', a: -2, b: 3, result: -8 }, '(-2) ^ 3'],
    [{ operation: 'sqrt', a: 16, result: 4 }, '√16'],
    [{ operation: 'percent', a: 15, b: 200, result: 30 }, '15 % of 200'],
  ] as const)('formats %o as %s', (response, expected) => {
    expect(formatExpression(response)).toBe(expected)
  })

  it('shows operands exactly, without the rounding applied to results', () => {
    expect(formatExpression({ operation: 'sqrt', a: 123456789012345, result: 11111111.061111 })).toBe(
      '√123456789012345',
    )
    expect(formatExpression({ operation: 'add', a: 0.1234567890123, b: 1, result: 1.1234567890123 })).toBe(
      '0.1234567890123 + 1',
    )
  })
})

describe('formatPending', () => {
  it.each([
    [12, 'multiply', '12 ×'],
    [15, 'percent', '15 % of'],
    [-2, 'power', '(-2) ^'],
    [-2, 'add', '-2 +'],
  ] as const)('formats %d %s as %s', (a, operation, expected) => {
    expect(formatPending(a, operation)).toBe(expected)
  })
})

describe('capitalize', () => {
  it('capitalises the first letter only', () => {
    expect(capitalize('cannot divide by zero')).toBe('Cannot divide by zero')
  })

  it('handles an empty string', () => {
    expect(capitalize('')).toBe('')
  })
})
