import type { BinaryOperation, Operation } from './operations'

/**
 * Formats a number for display, rounding to 12 significant digits to hide
 * binary floating-point noise (0.1 + 0.2 shows as 0.3). Scientific notation is
 * used when the result would not fit the display, and whenever rounding drops
 * integer digits: 1234567890123456 shows as 1.23456789012e+15, never as a
 * plausible-looking but wrong 1234567890120000. The API still returns the
 * exact float64 value.
 */
export function formatNumber(value: number): string {
  const rounded = Number(value.toPrecision(SIGNIFICANT_DIGITS))
  const text = String(rounded)
  const lostIntegerDigits = rounded !== value && Math.abs(rounded) >= 10 ** SIGNIFICANT_DIGITS
  return lostIntegerDigits || text.length > MAX_DISPLAY_LENGTH ? rounded.toExponential() : text
}

const SIGNIFICANT_DIGITS = 12
const MAX_DISPLAY_LENGTH = 16

const BINARY_SYMBOLS: Record<BinaryOperation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percent: '% of',
}

/**
 * How an operand is shown in the expression line: exactly as typed, or, for a
 * computed result, rounded the same way as the main display, so the two lines
 * always agree (0.1 + 0.2 = then + shows "0.3 +", not "0.30000000000000004 +").
 */
export function formatOperand(value: number, isResult: boolean): string {
  return isResult ? formatNumber(value) : String(value)
}

// Parenthesise negatives where they would read ambiguously: "2 − (-3)", "(-2) ^ 3", "√(-4)".
function wrap(label: string, parenthesiseNegative: boolean): string {
  return parenthesiseNegative && label.startsWith('-') ? `(${label})` : label
}

/** Renders a pending binary operation from a formatted operand, e.g. "12 ×". */
export function formatPending(a: string, operation: BinaryOperation): string {
  return `${wrap(a, operation === 'power')} ${BINARY_SYMBOLS[operation]}`
}

/**
 * Renders a calculation from formatted operands (see formatOperand), e.g.
 * "10 ÷ 4" or "√16". `b` is ignored for sqrt.
 */
export function formatExpression(operation: Operation, a: string, b = ''): string {
  if (operation === 'sqrt') {
    return `√${wrap(a, true)}`
  }
  return `${formatPending(a, operation)} ${wrap(b, true)}`
}

/** Capitalises the first letter of a message, e.g. a backend error message. */
export function capitalize(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1)
}
