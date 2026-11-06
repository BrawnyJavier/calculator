/** Operation names accepted by the backend API. */
export type Operation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'percent'

export interface OperationInfo {
  id: Operation
  /** Short symbol shown on the operation button. */
  symbol: string
  /** Human-readable name, used as the accessible label. */
  label: string
  /** Number of operands: unary operations only use `a`. */
  arity: 1 | 2
}

const OPERATION_INFO: Record<Operation, OperationInfo> = {
  add: { id: 'add', symbol: '+', label: 'Add', arity: 2 },
  subtract: { id: 'subtract', symbol: '−', label: 'Subtract', arity: 2 },
  multiply: { id: 'multiply', symbol: '×', label: 'Multiply', arity: 2 },
  divide: { id: 'divide', symbol: '÷', label: 'Divide', arity: 2 },
  power: { id: 'power', symbol: 'xʸ', label: 'Power', arity: 2 },
  sqrt: { id: 'sqrt', symbol: '√', label: 'Square root', arity: 1 },
  percent: { id: 'percent', symbol: '%', label: 'Percent of', arity: 2 },
}

/** All operations, in display order. */
export const OPERATIONS: readonly OperationInfo[] = Object.values(OPERATION_INFO)

export function getOperation(id: Operation): OperationInfo {
  return OPERATION_INFO[id]
}
