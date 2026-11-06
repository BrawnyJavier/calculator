import type { CalculateResponse } from './api'

/**
 * Formats a number for display, rounding to 12 significant digits to hide
 * binary floating-point noise (0.1 + 0.2 shows as 0.3). The API still returns
 * the exact float64 value.
 */
export function formatNumber(value: number): string {
  return String(Number(value.toPrecision(12)))
}

/**
 * Renders a calculation as a readable expression, e.g. "10 ÷ 4". Operands are
 * shown exactly as sent, without formatNumber's rounding, so the expression
 * never misstates what the user typed.
 */
export function formatExpression({ operation, a, b = 0 }: CalculateResponse): string {
  const x = String(a)
  // Parenthesise a negative right operand so "2 − (-3)" stays unambiguous.
  const y = b < 0 ? `(${b})` : String(b)

  switch (operation) {
    case 'add':
      return `${x} + ${y}`
    case 'subtract':
      return `${x} − ${y}`
    case 'multiply':
      return `${x} × ${y}`
    case 'divide':
      return `${x} ÷ ${y}`
    case 'power':
      return `${a < 0 ? `(${x})` : x} ^ ${y}`
    case 'sqrt':
      return `√${x}` // a is never negative: the backend rejects it
    case 'percent':
      return `${x}% of ${y}`
  }
}

/** Capitalises the first letter of a message, e.g. a backend error message. */
export function capitalize(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1)
}
