// Package api exposes the calculator over HTTP. It only translates between
// JSON requests/responses and the calculator package; it does no arithmetic.
package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
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
	codeUnsupportedMedia  = "unsupported_media_type"
	codeNotFound          = "not_found"
	codeMethodNotAllowed  = "method_not_allowed"
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
//
// Every response this handler writes, including 404 and 405, has a JSON body.
// The one exception comes from ServeMux itself: a request for an unclean path
// (such as "/api/v1//calculate") is redirected to the clean one with a 307.
func NewHandler(logger *slog.Logger) http.Handler {
	h := &handler{logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/calculate", h.calculate)
	mux.HandleFunc("GET /healthz", h.health)

	// ServeMux answers unmatched requests in plain text, so register
	// method-less fallbacks: the method-specific patterns above take
	// precedence, and these catch everything else.
	mux.HandleFunc("/api/v1/calculate", h.methodNotAllowed("POST"))
	mux.HandleFunc("/healthz", h.methodNotAllowed("GET, HEAD"))
	mux.HandleFunc("/", h.notFound)
	return mux
}

func (h *handler) methodNotAllowed(allow string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", allow)
		h.writeError(w, http.StatusMethodNotAllowed, codeMethodNotAllowed,
			fmt.Sprintf("method %s is not allowed; use %s", r.Method, allow))
	}
}

func (h *handler) notFound(w http.ResponseWriter, r *http.Request) {
	h.writeError(w, http.StatusNotFound, codeNotFound, fmt.Sprintf("no route for %s", r.URL.Path))
}

func (h *handler) health(w http.ResponseWriter, _ *http.Request) {
	h.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *handler) calculate(w http.ResponseWriter, r *http.Request) {
	if !isJSON(r.Header.Get("Content-Type")) {
		h.writeError(w, http.StatusUnsupportedMediaType, codeUnsupportedMedia, `Content-Type must be "application/json"`)
		return
	}

	var req calculateRequest
	if err := decodeJSON(w, r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, codeInvalidRequest, err.Error())
		return
	}
	if req.Operation == "" {
		h.writeError(w, http.StatusBadRequest, codeInvalidRequest, `field "operation" is required`)
		return
	}
	// Check the operation before the operands, so that a request with an
	// unknown operation is told so rather than which operand is missing.
	op := calculator.Operation(req.Operation)
	if _, ok := calculator.Arity(op); !ok {
		h.writeError(w, http.StatusBadRequest, codeUnknownOperation, fmt.Sprintf("unknown operation %q", op))
		return
	}
	if req.A == nil {
		h.writeError(w, http.StatusBadRequest, codeMissingOperand, `field "a" is required`)
		return
	}

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

// isJSON reports whether a Content-Type header value is application/json,
// with or without parameters such as charset.
func isJSON(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	return err == nil && mediaType == "application/json"
}

// decodeJSON strictly decodes a single JSON object from the request body into
// dst, a pointer to a struct. Returned errors have client-safe messages.
//
// Beyond what encoding/json enforces, keys must match a field's JSON name
// exactly and appear at most once: by default encoding/json matches keys
// case-insensitively and lets the last duplicate win, so {"a":1,"A":5} would
// silently set a to 5.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return fmt.Errorf("request body must not exceed %d bytes", maxBytesErr.Limit)
		}
		return errors.New("request body could not be read")
	}
	if err := checkKeys(body, jsonFieldNames(dst)); err != nil {
		return err
	}

	dec := json.NewDecoder(bytes.NewReader(body))
	if err := dec.Decode(dst); err != nil {
		var syntaxErr *json.SyntaxError
		var typeErr *json.UnmarshalTypeError
		switch {
		case errors.Is(err, io.EOF):
			return errors.New("request body is empty")
		case errors.As(err, &syntaxErr), errors.Is(err, io.ErrUnexpectedEOF):
			return errors.New("request body is not valid JSON")
		case errors.As(err, &typeErr):
			if typeErr.Field == "" {
				return errors.New("request body must be a JSON object")
			}
			if typeErr.Type.Kind() == reflect.Float64 {
				if strings.HasPrefix(typeErr.Value, "number") {
					// A number such as 1e400 that float64 cannot hold.
					return fmt.Errorf("field %q is out of range", typeErr.Field)
				}
				return fmt.Errorf("field %q must be a number", typeErr.Field)
			}
			return fmt.Errorf("field %q must be a %s", typeErr.Field, typeErr.Type)
		default:
			return errors.New("request body is invalid")
		}
	}

	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain a single JSON object")
	}
	return nil
}

// checkKeys rejects a top-level JSON object whose keys are not all in fields
// or that repeats a key. Anything that is not a well-formed object is left for
// the full decode to report, so its error messages stay in one place.
func checkKeys(body []byte, fields map[string]bool) error {
	dec := json.NewDecoder(bytes.NewReader(body))
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return nil
	}
	seen := make(map[string]bool, len(fields))
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil
		}
		key, _ := tok.(string)
		switch {
		case !fields[key]:
			return fmt.Errorf("unknown field %q", key)
		case seen[key]:
			return fmt.Errorf("duplicate field %q", key)
		}
		seen[key] = true
		var skip json.RawMessage
		if err := dec.Decode(&skip); err != nil {
			return nil
		}
	}
	return nil
}

// jsonFieldNames returns the JSON names of the fields of the struct dst
// points to.
func jsonFieldNames(dst any) map[string]bool {
	t := reflect.TypeOf(dst).Elem()
	names := make(map[string]bool, t.NumField())
	for f := range t.Fields() {
		name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		if name == "" {
			name = f.Name
		}
		if name != "-" {
			names[name] = true
		}
	}
	return names
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
	case errors.Is(err, calculator.ErrNegativeSqrt), errors.Is(err, calculator.ErrUndefinedResult):
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
