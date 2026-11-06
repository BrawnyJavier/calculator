import { describe, expect, it } from 'vitest'
import { capitalize, formatExpression, formatNumber, formatOperand, formatPending } from './format'

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

describe('formatOperand', () => {
  it('shows typed operands exactly', () => {
    expect(formatOperand(0.1234567890123, false)).toBe('0.1234567890123')
    expect(formatOperand(123456789012345, false)).toBe('123456789012345')
  })

  it('rounds results as the display does', () => {
    expect(formatOperand(0.1 + 0.2, true)).toBe('0.3')
    expect(formatOperand(1234567890123456, true)).toBe('1.23456789012e+15')
  })
})

describe('formatExpression', () => {
  it.each([
    ['add', '2', '3', '2 + 3'],
    ['subtract', '2', '-3', '2 − (-3)'],
    ['multiply', '6', '7', '6 × 7'],
    ['divide', '10', '4', '10 ÷ 4'],
    ['power', '2', '10', '2 ^ 10'],
    ['power', '-2', '3', '(-2) ^ 3'],
    ['sqrt', '16', undefined, '√16'],
    ['sqrt', '-4', undefined, '√(-4)'],
    ['percent', '15', '200', '15 % of 200'],
  ] as const)('formats %s %s %s as %s', (operation, a, b, expected) => {
    expect(formatExpression(operation, a, b)).toBe(expected)
  })
})

describe('formatPending', () => {
  it.each([
    ['12', 'multiply', '12 ×'],
    ['15', 'percent', '15 % of'],
    ['-2', 'power', '(-2) ^'],
    ['-2', 'add', '-2 +'],
  ] as const)('formats %s %s as %s', (a, operation, expected) => {
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
