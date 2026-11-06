import type { CalculateRequest } from './api'
import { getOperation, type Operation } from './operations'

// Plain decimal or scientific notation, e.g. "42", "-3.5", ".5", "1e3".
// Stricter than Number(), which also accepts "0x10", "Infinity" and "".
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i

export type ParseResult = { ok: true; value: number } | { ok: false; error: string }

/** Parses a user-entered operand. Checks shape only, not math rules. */
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

export interface FieldErrors {
  a?: string
  b?: string
}

export type ValidationResult =
  | { ok: true; request: CalculateRequest }
  | { ok: false; errors: FieldErrors }

/**
 * Validates the form inputs for an operation and builds the API request.
 * Operand `b` is ignored for unary operations. Rules such as division by
 * zero are left to the backend, which is the source of truth.
 */
export function validateInputs(operation: Operation, rawA: string, rawB: string): ValidationResult {
  const errors: FieldErrors = {}

  const a = parseOperand(rawA)
  if (!a.ok) errors.a = a.error

  const needsB = getOperation(operation).arity === 2
  const b = needsB ? parseOperand(rawB) : undefined
  if (b && !b.ok) errors.b = b.error

  if (!a.ok || (b && !b.ok)) {
    return { ok: false, errors }
  }

  const request: CalculateRequest = { operation, a: a.value }
  if (b?.ok) request.b = b.value
  return { ok: true, request }
}
