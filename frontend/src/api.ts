import type { Operation } from './operations'

export const CALCULATE_URL = '/api/v1/calculate'

/** How long to wait for the backend before giving up on a calculation. */
export const REQUEST_TIMEOUT_MS = 10_000

const OPERATIONS: ReadonlySet<string> = new Set<Operation>([
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'sqrt',
  'percent',
])

export interface CalculateRequest {
  operation: Operation
  a: number
  /** Omitted for unary operations. */
  b?: number
}

export interface CalculateResponse extends CalculateRequest {
  result: number
}

/**
 * An error to show the user. `code` is the backend's error code, or one of
 * `network_error`, `timeout`, `http_error` and `invalid_response` for
 * client-side failures.
 */
export class ApiError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/**
 * Asks the backend to perform a calculation. Rejects with ApiError on any
 * failure, including no answer within `timeoutMs`, except when `signal`
 * aborts the request: the AbortError is re-thrown unchanged so callers can
 * ignore it.
 */
export async function calculate(
  request: CalculateRequest,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<CalculateResponse> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  let body: unknown
  try {
    response = await fetch(CALCULATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: combined,
    })
    body = await readJson(response)
  } catch (err) {
    if (signal?.aborted) throw err
    if (timeout.aborted) {
      throw new ApiError('timeout', 'The calculator service took too long to respond. Please try again.')
    }
    throw new ApiError('network_error', 'Could not reach the calculator service. Please try again.')
  }

  if (!response.ok) {
    if (isErrorBody(body)) {
      throw new ApiError(body.error.code, body.error.message, response.status)
    }
    throw new ApiError('http_error', `Request failed (status ${response.status})`, response.status)
  }

  if (!isCalculateResponse(body)) {
    throw new ApiError('invalid_response', 'Unexpected response from the calculator service', response.status)
  }
  return body
}

/** Reads a JSON body; undefined if it is not JSON. Aborts and timeouts propagate. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorBody(body: unknown): body is { error: { code: string; message: string } } {
  return (
    isObject(body) &&
    isObject(body.error) &&
    typeof body.error.code === 'string' &&
    typeof body.error.message === 'string'
  )
}

// Exactly the shape the UI renders: a known operation, and `b` present for
// binary operations and absent for sqrt.
function isCalculateResponse(body: unknown): body is CalculateResponse {
  if (!isObject(body) || typeof body.operation !== 'string' || !OPERATIONS.has(body.operation)) {
    return false
  }
  const unary = body.operation === 'sqrt'
  return (
    typeof body.a === 'number' &&
    (unary ? body.b === undefined : typeof body.b === 'number') &&
    typeof body.result === 'number'
  )
}
