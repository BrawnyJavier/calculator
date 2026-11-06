import { describe, expect, it } from 'vitest'
import { parseOperand } from './validation'

describe('parseOperand', () => {
  it.each([
    ['42', 42],
    ['-7', -7],
    ['+7', 7],
    ['3.14', 3.14],
    ['.5', 0.5],
    ['-.5', -0.5],
    ['5.', 5],
    ['0', 0],
    ['1e3', 1000],
    ['2.5E-3', 0.0025],
    ['  12  ', 12],
  ])('accepts %j as %d', (raw, expected) => {
    expect(parseOperand(raw)).toEqual({ ok: true, value: expected })
  })

  it.each(['', '   '])('rejects empty input %j', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, error: 'Enter a number' })
  })

  it.each(['abc', '1.2.3', '1,000', '0x10', 'Infinity', 'NaN', '1e', '--1', '1 2', '.', '-'])(
    'rejects malformed input %j',
    (raw) => {
      expect(parseOperand(raw)).toEqual({ ok: false, error: 'Enter a valid number' })
    },
  )

  it('rejects numbers that overflow to Infinity', () => {
    expect(parseOperand('1e400')).toEqual({ ok: false, error: 'Number is too large' })
  })
})
