// Plain decimal or scientific notation, e.g. "42", "-3.5", ".5", "1e3".
// Stricter than Number(), which also accepts "0x10", "Infinity" and "".
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i

export type ParseResult = { ok: true; value: number } | { ok: false; error: string }

/**
 * Parses an operand entered on the keypad. Checks shape only, not math rules
 * (division by zero etc. are left to the backend, the source of truth).
 */
export function parseOperand(raw: string): ParseResult {
  const text = raw.trim()
  if (text === '') {
    return { ok: false, error: 'Enter a number' }
  }
  if (!NUMBER_PATTERN.test(text)) {
    return { ok: false, error: 'Enter a valid number' }
  }
  const value = Number(text)
  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Number is too large' }
  }
  return { ok: true, value }
}
