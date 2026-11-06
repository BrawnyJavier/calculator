/** Operation names accepted by the backend API. */
export type Operation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'percent'

/** Operations that take two operands. */
export type BinaryOperation = Exclude<Operation, 'sqrt'>

const LABELS: Record<Operation, string> = {
  add: 'Add',
  subtract: 'Subtract',
  multiply: 'Multiply',
  divide: 'Divide',
  power: 'Power',
  sqrt: 'Square root',
  percent: 'Percent of',
}

/** Human-readable name of an operation, used as an accessible label. */
export function operationLabel(operation: Operation): string {
  return LABELS[operation]
}
