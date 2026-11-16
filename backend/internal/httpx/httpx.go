package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func NewError(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func NotFound(message string) *Error { return NewError(http.StatusNotFound, "not_found", message) }

func Conflict(code, message string) *Error { return NewError(http.StatusConflict, code, message) }

func Unprocessable(code, message string) *Error {
	return NewError(http.StatusUnprocessableEntity, code, message)
}

var ErrUnauthorized = NewError(http.StatusUnauthorized, "unauthorized", "Sesi kamu sudah berakhir. Silakan masuk lagi.")

type HandlerFunc func(w http.ResponseWriter, r *http.Request) error

func H(fn HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			Fail(w, r, err)
		}
	}
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func NoContent(w http.ResponseWriter) { w.WriteHeader(http.StatusNoContent) }

func Fail(w http.ResponseWriter, r *http.Request, err error) {
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		slog.ErrorContext(r.Context(), "unhandled error", "err", err, "path", r.URL.Path, "method", r.Method)
		apiErr = NewError(http.StatusInternalServerError, "internal_error", "Terjadi kesalahan di server. Coba lagi sebentar.")
	}
	JSON(w, apiErr.Status, map[string]any{"error": apiErr})
}

const maxBody = 1 << 20

func Decode(r *http.Request, dst any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var syntaxErr *json.SyntaxError
		var typeErr *json.UnmarshalTypeError
		switch {
		case errors.Is(err, io.EOF):
			return NewError(http.StatusBadRequest, "invalid_json", "Body request kosong.")
		case errors.As(err, &typeErr):
			return &Error{Status: http.StatusUnprocessableEntity, Code: "validation_error",
				Message: "Periksa kembali isian kamu.",
				Fields:  map[string]string{typeErr.Field: "Format nilai tidak sesuai."}}
		case errors.As(err, &syntaxErr):
			return NewError(http.StatusBadRequest, "invalid_json", "Format JSON tidak valid.")
		case strings.HasPrefix(err.Error(), "json: unknown field"):
			return NewError(http.StatusBadRequest, "invalid_json", fmt.Sprintf("Field tidak dikenal: %s", strings.TrimPrefix(err.Error(), "json: unknown field ")))
		default:
			return NewError(http.StatusBadRequest, "invalid_json", "Format JSON tidak valid.")
		}
	}
	return nil
}

type Optional[T any] struct {
	Set   bool
	Null  bool
	Value T
}

func (o *Optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Null = true
		return nil
	}
	return json.Unmarshal(b, &o.Value)
}

type Validator struct{ fields map[string]string }

func NewValidator() *Validator { return &Validator{fields: map[string]string{}} }

func (v *Validator) Check(ok bool, field, message string) {
	if !ok {
		if _, exists := v.fields[field]; !exists {
			v.fields[field] = message
		}
	}
}

func (v *Validator) Add(field, message string) { v.Check(false, field, message) }

func (v *Validator) Err() error {
	if len(v.fields) == 0 {
		return nil
	}
	return &Error{Status: http.StatusUnprocessableEntity, Code: "validation_error",
		Message: "Periksa kembali isian kamu.", Fields: v.fields}
}

func FieldError(field, message string) error {
	v := NewValidator()
	v.Add(field, message)
	return v.Err()
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func IsUUID(s string) bool { return uuidRe.MatchString(s) }

func IDParam(r *http.Request, name, notFoundMsg string) (string, error) {
	id := chi.URLParam(r, name)
	if !IsUUID(id) {
		return "", NotFound(notFoundMsg)
	}
	return strings.ToLower(id), nil
}

func Page(r *http.Request, defSize, maxSize int) (page, size int) {
	page, _ = strconv.Atoi(r.URL.Query().Get("page"))
	size, _ = strconv.Atoi(r.URL.Query().Get("page_size"))
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = defSize
	}
	if size > maxSize {
		size = maxSize
	}
	return page, size
}
