package calculator

import (
	"errors"
	"math"
	"testing"
)

func ptr(f float64) *float64 { return &f }

func TestCalculate(t *testing.T) {
	tests := []struct {
		name string
		op   Operation
		a    float64
		b    *float64
		want float64
	}{
		{"add integers", Add, 2, ptr(3), 5},
		{"add negatives", Add, -2.5, ptr(-1.5), -4},
		{"subtract", Subtract, 10, ptr(4), 6},
		{"subtract to negative", Subtract, 4, ptr(10), -6},
		{"multiply", Multiply, 6, ptr(7), 42},
		{"multiply by zero", Multiply, 123.456, ptr(0), 0},
		{"multiply negatives", Multiply, -3, ptr(-4), 12},
		{"divide", Divide, 10, ptr(4), 2.5},
		{"divide zero numerator", Divide, 0, ptr(5), 0},
		{"divide negative", Divide, -9, ptr(3), -3},
		{"power", Power, 2, ptr(10), 1024},
		{"power negative exponent", Power, 2, ptr(-2), 0.25},
		{"power fractional exponent", Power, 9, ptr(0.5), 3},
		{"power zero to zero", Power, 0, ptr(0), 1},
		{"power negative base integer exponent", Power, -2, ptr(3), -8},
		{"sqrt", Sqrt, 16, nil, 4},
		{"sqrt zero", Sqrt, 0, nil, 0},
		{"sqrt fraction", Sqrt, 0.25, nil, 0.5},
		{"percent", Percent, 15, ptr(200), 30},
		{"percent over 100", Percent, 150, ptr(40), 60},
		{"percent negative", Percent, -10, ptr(50), -5},
		{"very small values", Multiply, 1e-200, ptr(1e-100), 1e-300},
		{"large but finite", Multiply, 1e154, ptr(1e154), 1e308},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if err != nil {
				t.Fatalf("Calculate(%q, %v, %v) returned error: %v", tt.op, tt.a, deref(tt.b), err)
			}
			if !almostEqual(got, tt.want) {
				t.Errorf("Calculate(%q, %v, %v) = %v, want %v", tt.op, tt.a, deref(tt.b), got, tt.want)
			}
		})
	}
}

func TestCalculateFloatingPoint(t *testing.T) {
	got, err := Calculate(Add, 0.1, ptr(0.2))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !almostEqual(got, 0.3) {
		t.Errorf("0.1 + 0.2 = %v, want approximately 0.3", got)
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name    string
		op      Operation
		a       float64
		b       *float64
		wantErr error
	}{
		{"unknown operation", Operation("modulo"), 1, ptr(2), ErrUnknownOperation},
		{"empty operation", Operation(""), 1, ptr(2), ErrUnknownOperation},
		{"operation is case sensitive", Operation("ADD"), 1, ptr(2), ErrUnknownOperation},
		{"add missing b", Add, 1, nil, ErrMissingOperand},
		{"subtract missing b", Subtract, 1, nil, ErrMissingOperand},
		{"multiply missing b", Multiply, 1, nil, ErrMissingOperand},
		{"divide missing b", Divide, 1, nil, ErrMissingOperand},
		{"power missing b", Power, 1, nil, ErrMissingOperand},
		{"percent missing b", Percent, 1, nil, ErrMissingOperand},
		{"sqrt with b", Sqrt, 4, ptr(2), ErrUnexpectedOperand},
		{"divide by zero", Divide, 1, ptr(0), ErrDivisionByZero},
		{"divide zero by zero", Divide, 0, ptr(0), ErrDivisionByZero},
		{"divide by negative zero", Divide, 1, ptr(math.Copysign(0, -1)), ErrDivisionByZero},
		{"sqrt negative", Sqrt, -4, nil, ErrNegativeSqrt},
		{"multiply overflow", Multiply, 1e308, ptr(10), ErrNonFiniteResult},
		{"add overflow", Add, math.MaxFloat64, ptr(math.MaxFloat64), ErrNonFiniteResult},
		{"power overflow", Power, 10, ptr(400), ErrNonFiniteResult},
		{"power negative base fractional exponent", Power, -8, ptr(0.5), ErrNonFiniteResult},
		{"power zero to negative exponent", Power, 0, ptr(-1), ErrNonFiniteResult},
		{"divide overflow", Divide, 1e308, ptr(1e-10), ErrNonFiniteResult},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.a, tt.b)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Calculate(%q, %v, %v) error = %v, want %v", tt.op, tt.a, deref(tt.b), err, tt.wantErr)
			}
			if got != 0 {
				t.Errorf("Calculate(%q, %v, %v) result = %v on error, want 0", tt.op, tt.a, deref(tt.b), got)
			}
		})
	}
}

func TestArity(t *testing.T) {
	tests := []struct {
		op     Operation
		want   int
		wantOK bool
	}{
		{Add, 2, true},
		{Subtract, 2, true},
		{Multiply, 2, true},
		{Divide, 2, true},
		{Power, 2, true},
		{Percent, 2, true},
		{Sqrt, 1, true},
		{Operation("modulo"), 0, false},
	}

	for _, tt := range tests {
		t.Run(string(tt.op), func(t *testing.T) {
			got, ok := Arity(tt.op)
			if got != tt.want || ok != tt.wantOK {
				t.Errorf("Arity(%q) = (%d, %t), want (%d, %t)", tt.op, got, ok, tt.want, tt.wantOK)
			}
		})
	}
}

// almostEqual compares floats with a relative tolerance, so it stays
// meaningful for very small and very large magnitudes. Exact zeros compare
// equal because the difference is then zero.
func almostEqual(got, want float64) bool {
	const eps = 1e-12
	return math.Abs(got-want) <= eps*math.Max(math.Abs(got), math.Abs(want))
}

func deref(f *float64) any {
	if f == nil {
		return "<nil>"
	}
	return *f
}
