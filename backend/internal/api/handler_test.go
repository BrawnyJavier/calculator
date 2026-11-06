package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestServer() http.Handler {
	return NewHandler(slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	newTestServer().ServeHTTP(rec, req)
	return rec
}

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{"add", `{"operation":"add","a":2,"b":3}`, `{"operation":"add","a":2,"b":3,"result":5}`},
		{"subtract", `{"operation":"subtract","a":2,"b":3}`, `{"operation":"subtract","a":2,"b":3,"result":-1}`},
		{"multiply", `{"operation":"multiply","a":-4,"b":2.5}`, `{"operation":"multiply","a":-4,"b":2.5,"result":-10}`},
		{"divide", `{"operation":"divide","a":10,"b":4}`, `{"operation":"divide","a":10,"b":4,"result":2.5}`},
		{"power", `{"operation":"power","a":2,"b":10}`, `{"operation":"power","a":2,"b":10,"result":1024}`},
		{"percent", `{"operation":"percent","a":15,"b":200}`, `{"operation":"percent","a":15,"b":200,"result":30}`},
		{"sqrt omits b", `{"operation":"sqrt","a":16}`, `{"operation":"sqrt","a":16,"result":4}`},
		{"zero operands", `{"operation":"add","a":0,"b":0}`, `{"operation":"add","a":0,"b":0,"result":0}`},
		{"scientific notation", `{"operation":"multiply","a":1e3,"b":2}`, `{"operation":"multiply","a":1000,"b":2,"result":2000}`},
		{"null b for unary op", `{"operation":"sqrt","a":9,"b":null}`, `{"operation":"sqrt","a":9,"result":3}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, http.MethodPost, "/api/v1/calculate", tt.body)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusOK, rec.Body)
			}
			assertJSONContentType(t, rec)
			if got := strings.TrimSpace(rec.Body.String()); got != tt.want {
				t.Errorf("body = %s, want %s", got, tt.want)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
		wantMsg    string // substring
	}{
		// Malformed requests.
		{"empty body", ``, 400, codeInvalidRequest, "empty"},
		{"malformed JSON", `{"operation":"add",`, 400, codeInvalidRequest, "not valid JSON"},
		{"syntax error", `{"operation" "add"}`, 400, codeInvalidRequest, "not valid JSON"},
		{"not an object", `[1,2]`, 400, codeInvalidRequest, "JSON object"},
		{"unknown field", `{"operation":"add","a":1,"b":2,"c":3}`, 400, codeInvalidRequest, `unknown field "c"`},
		{"string operand", `{"operation":"add","a":"1","b":2}`, 400, codeInvalidRequest, `field "a" must be a number`},
		{"numeric operation", `{"operation":1,"a":1,"b":2}`, 400, codeInvalidRequest, `field "operation" must be a string`},
		{"trailing data", `{"operation":"add","a":1,"b":2}{}`, 400, codeInvalidRequest, "single JSON object"},
		{"body too large", `{"operation":"add","a":1,"b":2,"pad":"` + strings.Repeat("x", maxBodyBytes) + `"}`, 400, codeInvalidRequest, "must not exceed"},
		{"number too large for float64", `{"operation":"add","a":1e400,"b":1}`, 400, codeInvalidRequest, `field "a" must be a number`},

		// Invalid operation or operands.
		{"missing operation", `{"a":1,"b":2}`, 400, codeUnknownOperation, `"operation" is required`},
		{"unknown operation", `{"operation":"modulo","a":1,"b":2}`, 400, codeUnknownOperation, `unknown operation "modulo"`},
		{"missing a", `{"operation":"add","b":2}`, 400, codeMissingOperand, `"a" is required`},
		{"null a", `{"operation":"add","a":null,"b":2}`, 400, codeMissingOperand, `"a" is required`},
		{"missing b", `{"operation":"divide","a":1}`, 400, codeMissingOperand, `requires field "b"`},
		{"b for sqrt", `{"operation":"sqrt","a":4,"b":2}`, 400, codeUnexpectedOperand, `does not accept field "b"`},

		// Well-formed but mathematically undefined.
		{"division by zero", `{"operation":"divide","a":1,"b":0}`, 422, codeDivisionByZero, "divide by zero"},
		{"negative sqrt", `{"operation":"sqrt","a":-1}`, 422, codeInvalidDomain, "negative"},
		{"overflow", `{"operation":"multiply","a":1e308,"b":10}`, 422, codeResultOutOfRange, "out of range"},
		{"NaN result", `{"operation":"power","a":-8,"b":0.5}`, 422, codeResultOutOfRange, "out of range"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, http.MethodPost, "/api/v1/calculate", tt.body)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d; body: %s", rec.Code, tt.wantStatus, rec.Body)
			}
			assertJSONContentType(t, rec)

			var got errorResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("decode error body: %v; body: %s", err, rec.Body)
			}
			if got.Error.Code != tt.wantCode {
				t.Errorf("code = %q, want %q", got.Error.Code, tt.wantCode)
			}
			if !strings.Contains(got.Error.Message, tt.wantMsg) {
				t.Errorf("message = %q, want it to contain %q", got.Error.Message, tt.wantMsg)
			}
		})
	}
}

func TestRouting(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
		wantAllow  string
	}{
		{"GET calculate not allowed", http.MethodGet, "/api/v1/calculate", http.StatusMethodNotAllowed, "POST"},
		{"PUT calculate not allowed", http.MethodPut, "/api/v1/calculate", http.StatusMethodNotAllowed, "POST"},
		{"POST healthz not allowed", http.MethodPost, "/healthz", http.StatusMethodNotAllowed, "GET, HEAD"},
		{"unknown path", http.MethodGet, "/api/v1/nope", http.StatusNotFound, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, tt.method, tt.path, "")
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := rec.Header().Get("Allow"); got != tt.wantAllow {
				t.Errorf("Allow = %q, want %q", got, tt.wantAllow)
			}
		})
	}
}

func TestHealth(t *testing.T) {
	rec := do(t, http.MethodGet, "/healthz", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	assertJSONContentType(t, rec)
	if got, want := strings.TrimSpace(rec.Body.String()), `{"status":"ok"}`; got != want {
		t.Errorf("body = %s, want %s", got, want)
	}
}

func TestMapErrorUnexpected(t *testing.T) {
	status, code, msg := mapError("add", errors.New("boom"))

	if status != http.StatusInternalServerError || code != codeInternal {
		t.Errorf("mapError = (%d, %q), want (%d, %q)", status, code, http.StatusInternalServerError, codeInternal)
	}
	if strings.Contains(msg, "boom") {
		t.Errorf("message %q leaks internal error details", msg)
	}
}

func assertJSONContentType(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
}
