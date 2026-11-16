package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"budgetly/internal/account"
	"budgetly/internal/auth"
	"budgetly/internal/budget"
	"budgetly/internal/category"
	"budgetly/internal/config"
	"budgetly/internal/goal"
	"budgetly/internal/httpx"
	"budgetly/internal/report"
	"budgetly/internal/transaction"
	"budgetly/internal/transfer"
)

func New(pool *pgxpool.Pool, cfg config.Config) http.Handler {
	r := chi.NewRouter()
	r.Use(requestLogger)
	r.Use(middleware.Recoverer)
	r.Use(cors(cfg.OriginAllowed))
	r.Use(securityHeaders)

	authH := auth.New(pool, cfg)

	r.Route("/api/v1", func(api chi.Router) {
		api.Use(auth.CSRF(cfg.OriginAllowed))
		api.Get("/health", httpx.H(func(w http.ResponseWriter, r *http.Request) error {
			ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			defer cancel()
			if err := pool.Ping(ctx); err != nil {
				return httpx.NewError(http.StatusServiceUnavailable, "db_unavailable", "Database tidak dapat dihubungi.")
			}
			httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
			return nil
		}))

		authH.PublicRoutes(api)

		api.Group(func(p chi.Router) {
			p.Use(authH.RequireAuth)
			authH.PrivateRoutes(p)
			(&account.Handler{DB: pool}).Routes(p)
			(&category.Handler{DB: pool}).Routes(p)
			(&transaction.Handler{DB: pool}).Routes(p)
			(&transfer.Handler{DB: pool}).Routes(p)
			(&budget.Handler{DB: pool}).Routes(p)
			(&goal.Handler{DB: pool}).Routes(p)
			(&report.Handler{DB: pool}).Routes(p)
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httpx.Fail(w, r, httpx.NotFound("Endpoint tidak ditemukan."))
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		httpx.Fail(w, r, httpx.NewError(http.StatusMethodNotAllowed, "method_not_allowed", "Metode tidak didukung."))
	})
	return r
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		b := make([]byte, 6)
		_, _ = rand.Read(b)
		reqID := hex.EncodeToString(b)
		w.Header().Set("X-Request-Id", reqID)
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		level := slog.LevelInfo
		if ww.Status() >= 500 {
			level = slog.LevelError
		}
		slog.Log(r.Context(), level, "request",
			"id", reqID, "method", r.Method, "path", r.URL.Path,
			"status", ww.Status(), "duration_ms", time.Since(start).Milliseconds())
	})
}

func cors(originAllowed func(string) bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := strings.TrimRight(r.Header.Get("Origin"), "/")
			if origin != "" && originAllowed(origin) {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Access-Control-Allow-Credentials", "true")
				h.Add("Vary", "Origin")
				if r.Method == http.MethodOptions {
					h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
					h.Set("Access-Control-Allow-Headers", "Content-Type, "+auth.CSRFHeader)
					h.Set("Access-Control-Max-Age", "600")
					w.WriteHeader(http.StatusNoContent)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
