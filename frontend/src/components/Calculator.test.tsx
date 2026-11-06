import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, calculate, type CalculateResponse } from '../api'
import { Calculator } from './Calculator'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  calculate: vi.fn(),
}))

const calculateMock = vi.mocked(calculate)

beforeEach(() => {
  calculateMock.mockReset()
})

function setup() {
  const user = userEvent.setup()
  render(<Calculator />)
  return {
    user,
    first: () => screen.getByRole('textbox', { name: /first number|^number$/i }),
    second: () => screen.queryByRole('textbox', { name: 'Second number' }),
    operation: (name: string) => screen.getByRole('radio', { name }),
    submit: () => screen.getByRole('button', { name: /calculat/i }),
    output: () => screen.getByRole('status'),
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
  it('renders both inputs, every operation and the submit button', () => {
    const ui = setup()

    expect(ui.first()).toBeInTheDocument()
    expect(ui.second()).toBeInTheDocument()
    for (const name of ['Add', 'Subtract', 'Multiply', 'Divide', 'Power', 'Square root', 'Percent of']) {
      expect(ui.operation(name)).toBeInTheDocument()
    }
    expect(ui.operation('Add')).toBeChecked()
    expect(ui.submit()).toBeEnabled()
    expect(ui.output()).toBeEmptyDOMElement()
  })

  it('hides the second input for square root and shows it again for binary operations', async () => {
    const ui = setup()

    await ui.user.click(ui.operation('Square root'))
    expect(ui.second()).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Number' })).toBeInTheDocument()

    await ui.user.click(ui.operation('Add'))
    expect(ui.second()).toBeInTheDocument()
  })

  it('shows field errors and does not call the API for invalid input', async () => {
    const ui = setup()

    await ui.user.type(ui.second()!, 'abc')
    await ui.user.click(ui.submit())

    expect(ui.first()).toHaveAccessibleDescription('Enter a number')
    expect(ui.first()).toHaveAttribute('aria-invalid', 'true')
    expect(ui.second()).toHaveAccessibleDescription('Enter a valid number')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('clears a field error when that field is edited', async () => {
    const ui = setup()

    await ui.user.click(ui.submit())
    expect(ui.first()).toHaveAccessibleDescription('Enter a number')

    await ui.user.type(ui.first(), '1')
    expect(ui.first()).not.toHaveAttribute('aria-invalid')
    expect(ui.second()).toHaveAccessibleDescription('Enter a number')
  })

  it('submits a valid calculation and shows the result', async () => {
    calculateMock.mockResolvedValue({ operation: 'divide', a: 10, b: 4, result: 2.5 })
    const ui = setup()

    await ui.user.type(ui.first(), '10')
    await ui.user.click(ui.operation('Divide'))
    await ui.user.type(ui.second()!, '4')
    await ui.user.click(ui.submit())

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'divide', a: 10, b: 4 }, expect.any(AbortSignal))
    expect(await screen.findByText('2.5')).toBeInTheDocument()
    expect(ui.output()).toHaveTextContent('10 ÷ 4 = 2.5')
  })

  it('sends only one operand for square root', async () => {
    calculateMock.mockResolvedValue({ operation: 'sqrt', a: 16, result: 4 })
    const ui = setup()

    await ui.user.type(ui.second()!, '99')
    await ui.user.click(ui.operation('Square root'))
    await ui.user.type(screen.getByRole('textbox', { name: 'Number' }), '16')
    await ui.user.click(ui.submit())

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'sqrt', a: 16 }, expect.any(AbortSignal))
    expect(await screen.findByText('4')).toBeInTheDocument()
  })

  it('submits with the Enter key', async () => {
    calculateMock.mockResolvedValue({ operation: 'add', a: 2, b: 3, result: 5 })
    const ui = setup()

    await ui.user.type(ui.first(), '2')
    await ui.user.type(ui.second()!, '3{Enter}')

    expect(await screen.findByText('5')).toBeInTheDocument()
  })

  it('shows the backend error message', async () => {
    calculateMock.mockRejectedValue(new ApiError('division_by_zero', 'cannot divide by zero', 422))
    const ui = setup()

    await ui.user.type(ui.first(), '1')
    await ui.user.type(ui.second()!, '0')
    await ui.user.click(ui.submit())

    expect(await screen.findByText('Cannot divide by zero')).toBeInTheDocument()
  })

  it('shows a generic message for unexpected errors', async () => {
    calculateMock.mockRejectedValue(new Error('boom'))
    const ui = setup()

    await ui.user.type(ui.first(), '1')
    await ui.user.type(ui.second()!, '2')
    await ui.user.click(ui.submit())

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
  })

  it('disables the button while the request is pending', async () => {
    const pending = deferred<CalculateResponse>()
    calculateMock.mockReturnValue(pending.promise)
    const ui = setup()

    await ui.user.type(ui.first(), '2')
    await ui.user.type(ui.second()!, '3')
    await ui.user.click(ui.submit())

    expect(ui.submit()).toBeDisabled()
    expect(ui.submit()).toHaveTextContent('Calculating…')

    pending.resolve({ operation: 'add', a: 2, b: 3, result: 5 })
    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(ui.submit()).toBeEnabled()
    expect(ui.submit()).toHaveTextContent('Calculate')
  })

  it('clears the previous result when an input changes', async () => {
    calculateMock.mockResolvedValue({ operation: 'add', a: 2, b: 3, result: 5 })
    const ui = setup()

    await ui.user.type(ui.first(), '2')
    await ui.user.type(ui.second()!, '3')
    await ui.user.click(ui.submit())
    expect(await screen.findByText('5')).toBeInTheDocument()

    await ui.user.type(ui.first(), '1')
    expect(ui.output()).toBeEmptyDOMElement()
  })

  it('cancels an in-flight request and ignores its answer when inputs change', async () => {
    const pending = deferred<CalculateResponse>()
    calculateMock.mockReturnValue(pending.promise)
    const ui = setup()

    await ui.user.type(ui.first(), '2')
    await ui.user.type(ui.second()!, '3')
    await ui.user.click(ui.submit())
    const signal = calculateMock.mock.calls[0][1]!

    await ui.user.click(ui.operation('Multiply'))
    expect(signal.aborted).toBe(true)
    expect(ui.submit()).toBeEnabled()

    pending.reject(new DOMException('aborted', 'AbortError'))
    await Promise.resolve()
    expect(ui.output()).toBeEmptyDOMElement()
  })

  it('aborts the in-flight request on unmount', async () => {
    calculateMock.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    const { unmount } = render(<Calculator />)

    await user.type(screen.getByRole('textbox', { name: 'First number' }), '2')
    await user.type(screen.getByRole('textbox', { name: 'Second number' }), '3')
    await user.click(screen.getByRole('button', { name: 'Calculate' }))
    const signal = calculateMock.mock.calls[0][1]!

    unmount()
    expect(signal.aborted).toBe(true)
  })
})
