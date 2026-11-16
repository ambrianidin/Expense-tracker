package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"budgetly/internal/httpx"
)

const (
	SessionCookie = "budgetly_session"
	CSRFCookie    = "budgetly_csrf"
	CSRFHeader    = "X-CSRF-Token"
	sessionTTL    = 30 * 24 * time.Hour
)

type User struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type ctxKey struct{}

func withUser(ctx context.Context, u User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

func CurrentUser(ctx context.Context) User {
	u, _ := ctx.Value(ctxKey{}).(User)
	return u
}

func UserID(ctx context.Context) string { return CurrentUser(ctx).ID }

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

func (h *Handler) setCookie(w http.ResponseWriter, name, value string, httpOnly bool, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: httpOnly,
		Secure:   h.Cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func CSRF(originAllowed func(string) bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			if origin := r.Header.Get("Origin"); origin != "" && !originAllowed(origin) {
				httpx.Fail(w, r, httpx.NewError(http.StatusForbidden, "forbidden_origin", "Origin request tidak diizinkan."))
				return
			}
			cookie, err := r.Cookie(CSRFCookie)
			header := r.Header.Get(CSRFHeader)
			if err != nil || cookie.Value == "" || header == "" ||
				subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) != 1 {
				httpx.Fail(w, r, httpx.NewError(http.StatusForbidden, "csrf_invalid", "Token keamanan tidak valid. Muat ulang halaman lalu coba lagi."))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type RateLimiter struct {
	mu         sync.Mutex
	hits       map[string]*window
	limit      int
	per        time.Duration
	trustProxy bool
}

type window struct {
	start time.Time
	count int
}

func NewRateLimiter(limit int, per time.Duration, trustProxy bool) *RateLimiter {
	return &RateLimiter{hits: map[string]*window{}, limit: limit, per: per, trustProxy: trustProxy}
}

func (l *RateLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.hits) > 10_000 {
		for k, w := range l.hits {
			if now.Sub(w.start) > l.per {
				delete(l.hits, k)
			}
		}
	}
	w, ok := l.hits[key]
	if !ok || now.Sub(w.start) > l.per {
		l.hits[key] = &window{start: now, count: 1}
		return true
	}
	w.count++
	return w.count <= l.limit
}

func (l *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(clientIP(r, l.trustProxy), time.Now()) {
			w.Header().Set("Retry-After", "60")
			httpx.Fail(w, r, httpx.NewError(http.StatusTooManyRequests, "rate_limited", "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			first, _, _ := strings.Cut(xff, ",")
			if ip := strings.TrimSpace(first); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
