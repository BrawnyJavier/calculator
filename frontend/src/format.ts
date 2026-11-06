import type { CalculateResponse } from './api'
import type { BinaryOperation } from './operations'

/**
 * Formats a number for display, rounding to 12 significant digits to hide
 * binary floating-point noise (0.1 + 0.2 shows as 0.3), and switching to
 * scientific notation when the result would not fit the display. The API
 * still returns the exact float64 value.
 */
export function formatNumber(value: number): string {
  const rounded = Number(value.toPrecision(12))
  const text = String(rounded)
  return text.length > MAX_DISPLAY_LENGTH ? rounded.toExponential() : text
}

const MAX_DISPLAY_LENGTH = 16

const BINARY_SYMBOLS: Record<BinaryOperation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percent: '% of',
}

// Parenthesise negatives where they would read ambiguously: "2 − (-3)", "(-2) ^ 3".
function operand(value: number, parenthesiseNegative: boolean): string {
  return parenthesiseNegative && value < 0 ? `(${value})` : String(value)
}

/** Renders a pending binary operation, e.g. "12 ×". */
export function formatPending(a: number, operation: BinaryOperation): string {
  return `${operand(a, operation === 'power')} ${BINARY_SYMBOLS[operation]}`
}

/**
 * Renders a calculation as a readable expression, e.g. "10 ÷ 4". Operands are
 * shown exactly as sent, without formatNumber's rounding, so the expression
 * never misstates what the user typed.
 */
export function formatExpression({ operation, a, b = 0 }: CalculateResponse): string {
  if (operation === 'sqrt') {
    return `√${a}` // a is never negative: the backend rejects it
  }
  return `${formatPending(a, operation)} ${operand(b, true)}`
}

/** Capitalises the first letter of a message, e.g. a backend error message. */
export function capitalize(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1)
}
