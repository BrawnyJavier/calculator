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
	ErrUndefinedResult   = errors.New("result is not a real number")
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
// Percent returns a percent of b (a * b / 100). A result that is not a real
// number (a negative base with a fractional exponent) is reported as
// ErrUndefinedResult, and one that overflows as ErrNonFiniteResult. A zero
// result is always +0, never -0.
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
		if math.IsInf(result, 0) {
			// a*b overflowed before the division; scale first instead.
			// Not the default order, because b/100 is rarely exact.
			result = a * (*b / 100)
		}
	case Sqrt:
		if a < 0 {
			return 0, ErrNegativeSqrt
		}
		result = math.Sqrt(a)
	}

	switch {
	case math.IsNaN(result):
		return 0, ErrUndefinedResult
	case math.IsInf(result, 0):
		return 0, ErrNonFiniteResult
	case result == 0:
		return 0, nil // normalise -0 (e.g. -1 * 0) to 0
	}
	return result, nil
}
