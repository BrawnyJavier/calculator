import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, CALCULATE_URL, calculate } from './api'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected promise to reject')
}

describe('calculate', () => {
  it('POSTs the request as JSON and returns the parsed response', async () => {
    const body = { operation: 'divide', a: 10, b: 4, result: 2.5 }
    fetchMock.mockResolvedValue(jsonResponse(body))
    const controller = new AbortController()

    await expect(calculate({ operation: 'divide', a: 10, b: 4 }, controller.signal)).resolves.toEqual(body)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(CALCULATE_URL)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init?.body as string)).toEqual({ operation: 'divide', a: 10, b: 4 })
    expect(init?.signal).toBe(controller.signal)
  })

  it('does not send b for unary operations', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ operation: 'sqrt', a: 16, result: 4 }))

    await calculate({ operation: 'sqrt', a: 16 })

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ operation: 'sqrt', a: 16 })
  })

  it('throws an ApiError with the backend code and message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'division_by_zero', message: 'cannot divide by zero' } }, 422),
    )

    const err = await captureError(calculate({ operation: 'divide', a: 1, b: 0 }))

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'division_by_zero', message: 'cannot divide by zero', status: 422 })
  })

  it('throws a generic ApiError when an error response is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))

    const err = await captureError(calculate({ operation: 'add', a: 1, b: 2 }))

    expect(err).toMatchObject({ code: 'http_error', message: 'Request failed (status 502)', status: 502 })
  })

  it('throws a generic ApiError when an error response has an unexpected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'nope' }, 500))

    const err = await captureError(calculate({ operation: 'add', a: 1, b: 2 }))

    expect(err).toMatchObject({ code: 'http_error', status: 500 })
  })

  it.each([
    ['a non-numeric result', { operation: 'add', a: 1, b: 2, result: '3' }],
    ['no operation', { a: 1, b: 2, result: 3 }],
    ['a non-numeric operand', { operation: 'add', a: '1', b: 2, result: 3 }],
    ['a non-numeric b', { operation: 'add', a: 1, b: null, result: 3 }],
    ['a non-object body', [3]],
  ])('throws invalid_response when a successful response has %s', async (_, body) => {
    fetchMock.mockResolvedValue(jsonResponse(body))

    const err = await captureError(calculate({ operation: 'add', a: 1, b: 2 }))

    expect(err).toMatchObject({ code: 'invalid_response', status: 200 })
  })

  it('throws network_error when the request cannot be sent', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const err = await captureError(calculate({ operation: 'add', a: 1, b: 2 }))

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'network_error', status: undefined })
  })

  it('re-throws AbortError unchanged when the request is aborted', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    fetchMock.mockRejectedValue(abortError)

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toBe(abortError)
  })

  it('re-throws AbortError raised while reading the body', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    const response = jsonResponse({ result: 3 })
    vi.spyOn(response, 'json').mockRejectedValue(abortError)
    fetchMock.mockResolvedValue(response)

    await expect(calculate({ operation: 'add', a: 1, b: 2 })).rejects.toBe(abortError)
  })
})
