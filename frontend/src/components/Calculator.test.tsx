import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, calculate, type CalculateRequest, type CalculateResponse } from '../api'
import { Calculator } from './Calculator'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  calculate: vi.fn(),
}))

const calculateMock = vi.mocked(calculate)

/** A fake backend that does the arithmetic locally. */
function fakeBackend(request: CalculateRequest): Promise<CalculateResponse> {
  const { operation, a, b = 0 } = request
  const result = {
    add: a + b,
    subtract: a - b,
    multiply: a * b,
    divide: a / b,
    power: a ** b,
    sqrt: Math.sqrt(a),
    percent: (a * b) / 100,
  }[operation]
  return Promise.resolve({ ...request, result })
}

beforeEach(() => {
  calculateMock.mockReset()
  calculateMock.mockImplementation(fakeBackend)
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Calculator />)
  return {
    ...utils,
    user,
    /** Clicks keys by accessible name, e.g. press('1', '0', 'Divide', '4', 'Equals'). */
    press: async (...names: string[]) => {
      for (const name of names) await user.click(screen.getByRole('button', { name }))
    },
    display: () => screen.getByTestId('display'),
    expression: () => screen.getByTestId('expression'),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('Calculator', () => {
  it('renders a display and every key', () => {
    const ui = setup()

    expect(ui.display()).toHaveTextContent('0')
    for (const name of [
      'All clear', 'Backspace', 'Percent of', 'Divide', 'Square root', 'Power', 'Toggle sign', 'Multiply',
      'Subtract', 'Add', 'Equals', 'Decimal point', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('calculates a binary operation via the API and shows the result', async () => {
    const ui = setup()

    await ui.press('1', '0', 'Divide')
    expect(ui.expression()).toHaveTextContent('10 ÷')
    expect(screen.getByRole('button', { name: 'Divide' })).toHaveAttribute('aria-pressed', 'true')

    await ui.press('4', 'Equals')

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'divide', a: 10, b: 4 }, expect.any(AbortSignal))
    expect(ui.display()).toHaveTextContent('2.5')
    expect(ui.expression()).toHaveTextContent('10 ÷ 4 =')
    expect(screen.getByRole('status')).toHaveTextContent('10 ÷ 4 = 2.5')
  })

  it('rounds floating-point noise in results', async () => {
    const ui = setup()

    await ui.press('0', 'Decimal point', '1', 'Add', '0', 'Decimal point', '2', 'Equals')

    expect(ui.display()).toHaveTextContent(/^0\.3$/)
  })

  it('chains operations, evaluating the pending one first', async () => {
    const ui = setup()

    await ui.press('2', 'Add', '3', 'Multiply')
    expect(calculateMock).toHaveBeenLastCalledWith({ operation: 'add', a: 2, b: 3 }, expect.any(AbortSignal))
    expect(ui.expression()).toHaveTextContent('5 ×')

    await ui.press('4', 'Equals')
    expect(calculateMock).toHaveBeenLastCalledWith({ operation: 'multiply', a: 5, b: 4 }, expect.any(AbortSignal))
    expect(ui.display()).toHaveTextContent('20')
  })

  it('calculates a square root of the current entry', async () => {
    const ui = setup()

    await ui.press('1', '6', 'Square root')

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'sqrt', a: 16 }, expect.any(AbortSignal))
    expect(ui.display()).toHaveTextContent('4')
    expect(ui.expression()).toHaveTextContent('√16 =')
  })

  it('supports percent, power and the sign toggle', async () => {
    const ui = setup()

    await ui.press('1', '5', 'Percent of', '2', '0', '0', 'Equals')
    expect(ui.display()).toHaveTextContent('30')

    await ui.press('2', 'Toggle sign', 'Power', '3', 'Equals')
    expect(calculateMock).toHaveBeenLastCalledWith({ operation: 'power', a: -2, b: 3 }, expect.any(AbortSignal))
    expect(ui.display()).toHaveTextContent('-8')
  })

  it('edits with backspace and all clear', async () => {
    const ui = setup()

    await ui.press('1', '2', '3', 'Backspace')
    expect(ui.display()).toHaveTextContent('12')

    await ui.press('Add', 'All clear')
    expect(ui.display()).toHaveTextContent('0')
    expect(ui.expression()).toBeEmptyDOMElement()
  })

  it('does nothing on "=" without a pending operation', async () => {
    const ui = setup()

    await ui.press('7', 'Equals')

    expect(calculateMock).not.toHaveBeenCalled()
    expect(ui.display()).toHaveTextContent('7')
  })

  it('shows the backend error message', async () => {
    calculateMock.mockRejectedValue(new ApiError('division_by_zero', 'cannot divide by zero', 422))
    const ui = setup()

    await ui.press('1', 'Divide', '0', 'Equals')

    expect(ui.display()).toHaveTextContent('Cannot divide by zero')
    expect(screen.getByRole('status')).toHaveTextContent('Cannot divide by zero')
  })

  it('shows a generic message for unexpected errors', async () => {
    calculateMock.mockRejectedValue(new Error('boom'))
    const ui = setup()

    await ui.press('1', 'Add', '2', 'Equals')

    expect(ui.display()).toHaveTextContent('Something went wrong. Please try again.')
  })

  it('stops chaining when the pending calculation fails', async () => {
    calculateMock.mockRejectedValue(new ApiError('division_by_zero', 'cannot divide by zero', 422))
    const ui = setup()

    await ui.press('1', 'Divide', '0', 'Add')

    expect(calculateMock).toHaveBeenCalledOnce()
    expect(ui.display()).toHaveTextContent('Cannot divide by zero')
  })

  it('ignores keys while a calculation is pending', async () => {
    const pending = deferred<CalculateResponse>()
    calculateMock.mockReturnValue(pending.promise)
    const ui = setup()

    await ui.press('2', 'Add', '3', 'Equals')
    expect(screen.getByRole('button', { name: 'Equals' })).toHaveAttribute('aria-disabled', 'true')

    await ui.press('9', 'Equals')
    expect(calculateMock).toHaveBeenCalledOnce()
    expect(ui.display()).toHaveTextContent('3')

    await act(async () => pending.resolve({ operation: 'add', a: 2, b: 3, result: 5 }))
    expect(ui.display()).toHaveTextContent('5')
    expect(screen.getByRole('button', { name: 'Equals' })).not.toHaveAttribute('aria-disabled')
  })

  it('supports the keyboard', async () => {
    const ui = setup()

    await ui.user.keyboard('12*3{Enter}')
    expect(calculateMock).toHaveBeenLastCalledWith({ operation: 'multiply', a: 12, b: 3 }, expect.any(AbortSignal))
    expect(ui.display()).toHaveTextContent('36')

    await ui.user.keyboard('9r')
    expect(ui.display()).toHaveTextContent('3')

    await ui.user.keyboard('45{Backspace}')
    expect(ui.display()).toHaveTextContent('4')

    await ui.user.keyboard('{Escape}')
    expect(ui.display()).toHaveTextContent('0')
  })

  it('ignores keyboard shortcuts with modifier keys and unmapped keys', async () => {
    const ui = setup()

    fireEvent.keyDown(window, { key: '5', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'q' })

    expect(ui.display()).toHaveTextContent('0')
  })

  it('briefly highlights a key pressed on the keyboard', async () => {
    vi.useFakeTimers()
    try {
      render(<Calculator />)
      const seven = screen.getByRole('button', { name: '7' })

      fireEvent.keyDown(window, { key: '7' })
      expect(seven).toHaveClass('key--flash')

      act(() => vi.advanceTimersByTime(200))
      expect(seven).not.toHaveClass('key--flash')
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts the in-flight request on unmount', async () => {
    calculateMock.mockReturnValue(new Promise(() => {}))
    const ui = setup()

    await ui.press('2', 'Add', '3', 'Equals')
    const signal = calculateMock.mock.calls[0][1]!

    ui.unmount()
    expect(signal.aborted).toBe(true)
  })
})
