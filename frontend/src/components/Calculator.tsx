import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react'
import { ApiError, calculate, type CalculateRequest } from '../api'
import {
  buildRequest,
  calculatorReducer,
  initialState,
  shouldChain,
  type CalculatorAction,
} from '../calculatorState'
import { capitalize, formatNumber } from '../format'
import { operationLabel, type BinaryOperation } from '../operations'

type KeyPress =
  | { kind: 'input'; action: CalculatorAction }
  | { kind: 'operator'; operation: BinaryOperation }
  | { kind: 'sqrt' }
  | { kind: 'equals' }

interface KeyDef {
  id: string
  label: string
  ariaLabel?: string
  variant: 'digit' | 'function' | 'operator' | 'equals'
  press: KeyPress
  /** KeyboardEvent.key values that trigger this key. */
  keys: string[]
  className?: string
}

const digit = (d: string): KeyDef => ({
  id: d,
  label: d,
  variant: 'digit',
  press: { kind: 'input', action: { type: 'digit', digit: d } },
  keys: [d],
  className: d === '0' ? 'key--wide' : undefined,
})

const operator = (operation: BinaryOperation, label: string, keys: string[]): KeyDef => ({
  id: operation,
  label,
  ariaLabel: operationLabel(operation),
  variant: 'operator',
  press: { kind: 'operator', operation },
  keys,
})

/** A non-digit, non-operator key: AC, ⌫, √, ±, = and the decimal point. */
const special = (
  id: string,
  label: string,
  ariaLabel: string,
  press: KeyPress,
  keys: string[],
  variant: KeyDef['variant'] = 'function',
  className?: string,
): KeyDef => ({ id, label, ariaLabel, variant, press, keys, className })

const input = (action: CalculatorAction): KeyPress => ({ kind: 'input', action })

// Listed in grid order: 4 columns, "=" spans two rows and "0" two columns.
const KEYS: readonly KeyDef[] = [
  special('clear', 'AC', 'All clear', input({ type: 'clear' }), ['Escape', 'Delete']),
  special('backspace', '⌫', 'Backspace', input({ type: 'backspace' }), ['Backspace']),
  operator('percent', '%', ['%']),
  operator('divide', '÷', ['/']),
  special('sqrt', '√', 'Square root', { kind: 'sqrt' }, ['r', 'R']),
  operator('power', 'xʸ', ['^']),
  special('sign', '±', 'Toggle sign', input({ type: 'toggleSign' }), ['n', 'N']),
  operator('multiply', '×', ['*', 'x', 'X']),
  digit('7'), digit('8'), digit('9'),
  operator('subtract', '−', ['-']),
  digit('4'), digit('5'), digit('6'),
  operator('add', '+', ['+']),
  digit('1'), digit('2'), digit('3'),
  special('equals', '=', 'Equals', { kind: 'equals' }, ['=', 'Enter'], 'equals', 'key--tall'),
  digit('0'),
  special('decimal', '.', 'Decimal point', input({ type: 'decimal' }), ['.', ','], 'digit'),
]

const KEY_BY_KEYBOARD = new Map(KEYS.flatMap((key) => key.keys.map((k) => [k, key] as const)))

const FLASH_MS = 120

export function Calculator() {
  const [state, dispatch] = useReducer(calculatorReducer, initialState)
  const [flashedKey, setFlashedKey] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      requestRef.current?.abort()
      window.clearTimeout(flashTimer.current)
    },
    [],
  )

  /** Sends a calculation; resolves to whether it succeeded. */
  async function run(request: CalculateRequest): Promise<boolean> {
    // Only one calculation is ever in flight; cancel any stale one first.
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    dispatch({ type: 'requestStarted', request })
    try {
      const response = await calculate(request, controller.signal)
      dispatch({ type: 'requestSucceeded', response })
      return true
    } catch (err) {
      if (controller.signal.aborted) return false
      const message = err instanceof ApiError ? capitalize(err.message) : 'Something went wrong. Please try again.'
      dispatch({ type: 'requestFailed', message })
      return false
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  // While a request is in flight the reducer ignores every key but AC, and
  // buildRequest returns null, so no second request can start.
  async function press(key: KeyDef) {
    const { press } = key

    switch (press.kind) {
      case 'input':
        // AC also cancels a calculation in flight (the way out of a slow one).
        if (press.action.type === 'clear') requestRef.current?.abort()
        dispatch(press.action)
        return
      case 'operator': {
        // "2 + 3 ×" evaluates 2 + 3 first, then continues with "5 ×".
        if (shouldChain(state)) {
          const request = buildRequest(state)
          if (request && !(await run(request))) return
        }
        dispatch({ type: 'operator', operation: press.operation })
        return
      }
      case 'sqrt': {
        const request = buildRequest(state, 'sqrt')
        if (request) await run(request)
        return
      }
      case 'equals': {
        const request = buildRequest(state)
        if (request) await run(request)
        return
      }
    }
  }

  // Keyboard support: digits, operators, Enter/=, Backspace, Escape.
  // useEffectEvent always sees the latest state, so the listener is
  // subscribed once instead of on every render.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const key = KEY_BY_KEYBOARD.get(event.key)
    if (!key) return
    // Also stops Enter from clicking a focused key a second time.
    event.preventDefault()
    setFlashedKey(key.id)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashedKey(null), FLASH_MS)
    void press(key)
  })

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const loading = state.status === 'loading'
  const error = state.status === 'error'
  const text = error ? state.error : state.isResult ? formatNumber(Number(state.display)) : state.display
  const length = text?.length ?? 0
  const size =
    length > 16 ? 'display-value--xxs' : length > 13 ? 'display-value--xs' : length > 9 ? 'display-value--sm' : ''
  // Re-mount the value (replaying its entrance animation) for each new result or error.
  const animationKey = error ? `error-${state.error}` : state.isResult ? `result-${state.display}-${state.expression}` : 'entry'
  const announcement = error ? (state.error ?? '') : state.isResult ? `${state.expression} ${text}` : ''

  return (
    <section className="calculator" aria-label="Calculator">
      <div className={`display${loading ? ' display--loading' : ''}`} aria-busy={loading}>
        <div className="display-expression" data-testid="expression">
          {state.expression}
        </div>
        <div
          key={animationKey}
          className={`display-value ${size}${state.isResult ? ' display-value--result' : ''}${error ? ' display-value--error' : ''}`}
          data-testid="display"
        >
          {text}
        </div>
        <div className="display-progress" aria-hidden="true" />
      </div>

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>

      <div className="keypad">
        {KEYS.map((key) => {
          const active = key.press.kind === 'operator' && state.operation === key.press.operation && !state.entered
          return (
            <button
              key={key.id}
              type="button"
              className={[
                'key',
                `key--${key.variant}`,
                key.className,
                active && 'key--active',
                flashedKey === key.id && 'key--flash',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={key.ariaLabel}
              aria-pressed={key.variant === 'operator' ? active : undefined}
              aria-disabled={(loading && key.id !== 'clear') || undefined}
              onClick={() => void press(key)}
            >
              {key.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
