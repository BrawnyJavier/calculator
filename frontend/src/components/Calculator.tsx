import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, calculate, type CalculateResponse } from '../api'
import { capitalize, formatExpression, formatNumber } from '../format'
import { getOperation, OPERATIONS, type Operation } from '../operations'
import { validateInputs, type FieldErrors } from '../validation'

type Outcome = { kind: 'result'; response: CalculateResponse } | { kind: 'error'; message: string }

export function Calculator() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [operation, setOperation] = useState<Operation>('add')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [loading, setLoading] = useState(false)

  // The in-flight request, so it can be cancelled when inputs change or the
  // component unmounts and a stale answer is never shown.
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  const needsB = getOperation(operation).arity === 2

  function resetOutcome() {
    requestRef.current?.abort()
    requestRef.current = null
    setLoading(false)
    setOutcome(null)
  }

  function handleOperationChange(next: Operation) {
    setOperation(next)
    setFieldErrors({})
    resetOutcome()
  }

  function handleInputChange(field: 'a' | 'b', value: string) {
    if (field === 'a') setA(value)
    else setB(value)
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }))
    resetOutcome()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validation = validateInputs(operation, a, b)
    if (!validation.ok) {
      setFieldErrors(validation.errors)
      setOutcome(null)
      return
    }

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setFieldErrors({})
    setOutcome(null)
    setLoading(true)

    try {
      const response = await calculate(validation.request, controller.signal)
      setOutcome({ kind: 'result', response })
    } catch (err) {
      if (controller.signal.aborted) return
      const message = err instanceof ApiError ? capitalize(err.message) : 'Something went wrong. Please try again.'
      setOutcome({ kind: 'error', message })
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }

  return (
    <form className="calculator" onSubmit={handleSubmit} noValidate aria-busy={loading}>
      <NumberField
        id="operand-a"
        label={needsB ? 'First number' : 'Number'}
        value={a}
        error={fieldErrors.a}
        onChange={(value) => handleInputChange('a', value)}
      />

      <fieldset className="operations">
        <legend>Operation</legend>
        {OPERATIONS.map((op) => (
          <label key={op.id} className="operation" title={op.label}>
            <input
              type="radio"
              name="operation"
              value={op.id}
              checked={operation === op.id}
              onChange={() => handleOperationChange(op.id)}
            />
            <span className="operation-symbol" aria-hidden="true">
              {op.symbol}
            </span>
            <span className="visually-hidden">{op.label}</span>
          </label>
        ))}
      </fieldset>

      {needsB && (
        <NumberField
          id="operand-b"
          label="Second number"
          value={b}
          error={fieldErrors.b}
          onChange={(value) => handleInputChange('b', value)}
        />
      )}

      <button type="submit" className="submit" disabled={loading}>
        {loading ? 'Calculating…' : 'Calculate'}
      </button>

      <div className="output" role="status" aria-live="polite">
        {outcome?.kind === 'result' && (
          <>
            <span className="output-expression">{formatExpression(outcome.response)} =</span>{' '}
            <span className="output-result">{formatNumber(outcome.response.result)}</span>
          </>
        )}
        {outcome?.kind === 'error' && <span className="output-error">{outcome.message}</span>}
      </div>
    </form>
  )
}

interface NumberFieldProps {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
}

function NumberField({ id, label, value, error, onChange }: NumberFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {/* type="text" so our validation owns the messages; inputMode is left
          as default because iOS's decimal pad has no minus key. */}
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}
