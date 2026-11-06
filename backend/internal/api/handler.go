// Package api exposes the calculator over HTTP. It only translates between
// JSON requests/responses and the calculator package; it does no arithmetic.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"strings"

	"github.com/BrawnyJavier/calculator/backend/internal/calculator"
)

// maxBodyBytes bounds request bodies. A valid request is well under 200 bytes.
const maxBodyBytes = 1 << 10

type calculateRequest struct {
	Operation string   `json:"operation"`
	A         *float64 `json:"a"`
	B         *float64 `json:"b"`
}

type calculateResponse struct {
	Operation string   `json:"operation"`
	A         float64  `json:"a"`
	B         *float64 `json:"b,omitempty"`
	Result    float64  `json:"result"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type errorResponse struct {
	Error errorBody `json:"error"`
}

// Error codes returned in the "code" field of error responses.
const (
	codeInvalidRequest    = "invalid_request"
	codeUnknownOperation  = "unknown_operation"
	codeMissingOperand    = "missing_operand"
	codeUnexpectedOperand = "unexpected_operand"
	codeDivisionByZero    = "division_by_zero"
	codeInvalidDomain     = "invalid_domain"
	codeResultOutOfRange  = "result_out_of_range"
	codeInternal          = "internal_error"
)

type handler struct {
	logger *slog.Logger
}

// NewHandler returns an http.Handler serving:
//
//	POST /api/v1/calculate
//	GET  /healthz
func NewHandler(logger *slog.Logger) http.Handler {
	h := &handler{logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", h.calculate)
	mux.HandleFunc("GET /healthz", h.health)
	return mux
}

func (h *handler) health(w http.ResponseWriter, _ *http.Request) {
	h.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *handler) calculate(w http.ResponseWriter, r *http.Request) {
	var req calculateRequest
	if err := decodeJSON(w, r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, codeInvalidRequest, err.Error())
		return
	}
	if req.Operation == "" {
		h.writeError(w, http.StatusBadRequest, codeUnknownOperation, `field "operation" is required`)
		return
	}
	if req.A == nil {
		h.writeError(w, http.StatusBadRequest, codeMissingOperand, `field "a" is required`)
		return
	}

	op := calculator.Operation(req.Operation)
	result, err := calculator.Calculate(op, *req.A, req.B)
	if err != nil {
		status, code, msg := mapError(op, err)
		if status >= http.StatusInternalServerError {
			h.logger.Error("calculate failed", "operation", op, "error", err)
		}
		h.writeError(w, status, code, msg)
		return
	}

	h.writeJSON(w, http.StatusOK, calculateResponse{
		Operation: req.Operation,
		A:         *req.A,
		B:         req.B,
		Result:    result,
	})
}

// decodeJSON strictly decodes a single JSON object from the request body into
// dst. Returned errors have client-safe messages.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		var syntaxErr *json.SyntaxError
		var typeErr *json.UnmarshalTypeError
		var maxBytesErr *http.MaxBytesError
		switch {
		case errors.Is(err, io.EOF):
			return errors.New("request body is empty")
		case errors.As(err, &maxBytesErr):
			return fmt.Errorf("request body must not exceed %d bytes", maxBytesErr.Limit)
		case errors.As(err, &syntaxErr), errors.Is(err, io.ErrUnexpectedEOF):
			return errors.New("request body is not valid JSON")
		case errors.As(err, &typeErr):
			if typeErr.Field == "" {
				return errors.New("request body must be a JSON object")
			}
			want := typeErr.Type.String()
			if typeErr.Type.Kind() == reflect.Float64 {
				want = "number"
			}
			return fmt.Errorf("field %q must be a %s", typeErr.Field, want)
		case strings.HasPrefix(err.Error(), "json: unknown field "):
			// encoding/json has no typed error for unknown fields.
			return fmt.Errorf("unknown field %s", strings.TrimPrefix(err.Error(), "json: unknown field "))
		default:
			return errors.New("request body is invalid")
		}
	}

	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain a single JSON object")
	}
	return nil
}

// mapError converts a calculator error to an HTTP status, error code and
// client-facing message. 400 means the request itself is malformed; 422 means
// it is well-formed but the math is undefined.
func mapError(op calculator.Operation, err error) (status int, code, msg string) {
	switch {
	case errors.Is(err, calculator.ErrUnknownOperation):
		return http.StatusBadRequest, codeUnknownOperation, fmt.Sprintf("unknown operation %q", op)
	case errors.Is(err, calculator.ErrMissingOperand):
		return http.StatusBadRequest, codeMissingOperand, fmt.Sprintf(`operation %q requires field "b"`, op)
	case errors.Is(err, calculator.ErrUnexpectedOperand):
		return http.StatusBadRequest, codeUnexpectedOperand, fmt.Sprintf(`operation %q does not accept field "b"`, op)
	case errors.Is(err, calculator.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, codeDivisionByZero, err.Error()
	case errors.Is(err, calculator.ErrNegativeSqrt):
		return http.StatusUnprocessableEntity, codeInvalidDomain, err.Error()
	case errors.Is(err, calculator.ErrNonFiniteResult):
		return http.StatusUnprocessableEntity, codeResultOutOfRange, err.Error()
	default:
		return http.StatusInternalServerError, codeInternal, "internal server error"
	}
}

func (h *handler) writeError(w http.ResponseWriter, status int, code, msg string) {
	h.writeJSON(w, status, errorResponse{Error: errorBody{Code: code, Message: msg}})
}

func (h *handler) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		h.logger.Error("write response", "error", err)
	}
}
