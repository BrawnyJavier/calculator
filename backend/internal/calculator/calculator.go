// Package calculator implements the arithmetic operations supported by the
// calculator service. It is pure domain logic with no knowledge of HTTP.
package calculator

import (
	"errors"
	"math"
)

// Operation identifies an arithmetic operation. Its values match the
// operation names used in the public API.
type Operation string

// Supported operations.
const (
	Add      Operation = "add"
	Subtract Operation = "subtract"
	Multiply Operation = "multiply"
	Divide   Operation = "divide"
	Power    Operation = "power"
	Sqrt     Operation = "sqrt"
	Percent  Operation = "percent"
)

// Errors returned by Calculate. Callers should compare with errors.Is.
var (
	ErrUnknownOperation  = errors.New("unknown operation")
	ErrMissingOperand    = errors.New("missing operand")
	ErrUnexpectedOperand = errors.New("unexpected operand")
	ErrDivisionByZero    = errors.New("cannot divide by zero")
	ErrNegativeSqrt      = errors.New("cannot take the square root of a negative number")
	ErrNonFiniteResult   = errors.New("result is out of range")
)

// Arity reports how many operands op takes. ok is false if op is unknown.
func Arity(op Operation) (n int, ok bool) {
	switch op {
	case Add, Subtract, Multiply, Divide, Power, Percent:
		return 2, true
	case Sqrt:
		return 1, true
	default:
		return 0, false
	}
}

// Calculate applies op to a and, for binary operations, b. b must be nil for
// unary operations and non-nil for binary ones.
//
// Percent returns a percent of b (a * b / 100). Results that are not finite
// (overflow, or NaN such as a negative base with a fractional exponent) are
// reported as ErrNonFiniteResult.
func Calculate(op Operation, a float64, b *float64) (float64, error) {
	arity, ok := Arity(op)
	if !ok {
		return 0, ErrUnknownOperation
	}
	if arity == 2 && b == nil {
		return 0, ErrMissingOperand
	}
	if arity == 1 && b != nil {
		return 0, ErrUnexpectedOperand
	}

	var result float64
	switch op {
	case Add:
		result = a + *b
	case Subtract:
		result = a - *b
	case Multiply:
		result = a * *b
	case Divide:
		if *b == 0 {
			return 0, ErrDivisionByZero
		}
		result = a / *b
	case Power:
		// 0^-n is 1/0^n: report it as the division by zero it is rather
		// than as the overflow math.Pow's +Inf would suggest.
		if a == 0 && *b < 0 {
			return 0, ErrDivisionByZero
		}
		result = math.Pow(a, *b)
	case Percent:
		result = a * *b / 100
	case Sqrt:
		if a < 0 {
			return 0, ErrNegativeSqrt
		}
		result = math.Sqrt(a)
	}

	if math.IsInf(result, 0) || math.IsNaN(result) {
		return 0, ErrNonFiniteResult
	}
	return result, nil
}
