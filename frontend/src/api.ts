import type { Operation } from './operations'

export const CALCULATE_URL = '/api/v1/calculate'

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
 * `network_error`, `http_error` and `invalid_response` for client-side failures.
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
 * failure, except when `signal` aborts the request: the AbortError is
 * re-thrown unchanged so callers can ignore it.
 */
export async function calculate(
  request: CalculateRequest,
  signal?: AbortSignal,
): Promise<CalculateResponse> {
  let response: Response
  try {
    response = await fetch(CALCULATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new ApiError('network_error', 'Could not reach the calculator service. Please try again.')
  }

  const body = await readJson(response)

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

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (err) {
    if (isAbortError(err)) throw err
    return undefined
  }
}

// Checks the name rather than `instanceof Error`: abort errors are
// DOMExceptions, which do not extend Error in every environment.
function isAbortError(err: unknown): boolean {
  return isObject(err) && err.name === 'AbortError'
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

function isCalculateResponse(body: unknown): body is CalculateResponse {
  return isObject(body) && typeof body.result === 'number'
}
