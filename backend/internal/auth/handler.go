package auth

import (
	"context"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"budgetly/internal/config"
	"budgetly/internal/httpx"
	"budgetly/internal/platform/db"
)

const bcryptCost = 12

type Handler struct {
	DB      *pgxpool.Pool
	Cfg     config.Config
	limiter *RateLimiter
	dummyHash []byte
}

func New(pool *pgxpool.Pool, cfg config.Config) *Handler {
	dummy, _ := bcrypt.GenerateFromPassword([]byte("budgetly-timing-equaliser"), bcryptCost)
	return &Handler{
		DB:        pool,
		Cfg:       cfg,
		limiter:   NewRateLimiter(cfg.AuthRateLimit, time.Minute, cfg.TrustProxy),
		dummyHash: dummy,
	}
}

func (h *Handler) PublicRoutes(r chi.Router) {
	r.With(h.limiter.Middleware).Post("/auth/register", httpx.H(h.register))
	r.With(h.limiter.Middleware).Post("/auth/login", httpx.H(h.login))
	r.Post("/auth/logout", httpx.H(h.logout))
	r.Get("/auth/csrf", httpx.H(h.csrf))
}

func (h *Handler) PrivateRoutes(r chi.Router) {
	r.Get("/auth/me", httpx.H(h.me))
	r.Patch("/auth/me", httpx.H(h.updateMe))
	r.Post("/auth/change-password", httpx.H(h.changePassword))
}

func (h *Handler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(SessionCookie)
		if err != nil || c.Value == "" {
			httpx.Fail(w, r, httpx.ErrUnauthorized)
			return
		}
		var u User
		err = h.DB.QueryRow(r.Context(), `
			SELECT u.id, u.name, u.email, u.created_at
			FROM sessions s JOIN users u ON u.id = s.user_id
			WHERE s.token_hash = $1 AND s.expires_at > now()`, hashToken(c.Value)).
			Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)
		if db.IsNoRows(err) {
			h.setCookie(w, SessionCookie, "", true, -1)
			httpx.Fail(w, r, httpx.ErrUnauthorized)
			return
		}
		if err != nil {
			httpx.Fail(w, r, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(withUser(r.Context(), u)))
	})
}

type registerReq struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func normaliseEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

func validEmail(s string) bool {
	if len(s) < 3 || len(s) > 254 || !strings.Contains(s, "@") {
		return false
	}
	addr, err := mail.ParseAddress(s)
	return err == nil && addr.Address == s
}

func validatePassword(v *httpx.Validator, field, pw string) {
	v.Check(utf8.RuneCountInString(pw) >= 8, field, "Password minimal 8 karakter.")
	v.Check(len(pw) <= 72, field, "Password maksimal 72 karakter.")
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) error {
	var req registerReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Email = normaliseEmail(req.Email)

	v := httpx.NewValidator()
	v.Check(req.Name != "", "name", "Nama wajib diisi.")
	v.Check(utf8.RuneCountInString(req.Name) <= 80, "name", "Nama maksimal 80 karakter.")
	v.Check(validEmail(req.Email), "email", "Format email tidak valid.")
	validatePassword(v, "password", req.Password)
	if err := v.Err(); err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcryptCost)
	if err != nil {
		return err
	}

	var u User
	token := randomToken()
	err = pgx.BeginFunc(r.Context(), h.DB, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
			RETURNING id, name, email, created_at`, req.Name, req.Email, string(hash)).
			Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)
		if err != nil {
			return err
		}
		if err := seedCategories(r.Context(), tx, u.ID); err != nil {
			return err
		}
		return insertSession(r.Context(), tx, u.ID, token)
	})
	if db.IsUniqueViolation(err, "users_email_key") {
		return httpx.FieldError("email", "Email ini sudah terdaftar. Coba masuk.")
	}
	if err != nil {
		return err
	}
	h.issueCookies(w, r, token)
	httpx.JSON(w, http.StatusCreated, map[string]any{"user": u})
	return nil
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) error {
	var req loginReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Email = normaliseEmail(req.Email)
	v := httpx.NewValidator()
	v.Check(req.Email != "", "email", "Email wajib diisi.")
	v.Check(req.Password != "", "password", "Password wajib diisi.")
	if err := v.Err(); err != nil {
		return err
	}

	var u User
	var hash string
	err := h.DB.QueryRow(r.Context(), `
		SELECT id, name, email, created_at, password_hash FROM users WHERE lower(email) = $1`, req.Email).
		Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt, &hash)
	invalid := httpx.NewError(http.StatusUnauthorized, "invalid_credentials", "Email atau password salah.")
	if db.IsNoRows(err) {
		_ = bcrypt.CompareHashAndPassword(h.dummyHash, []byte(req.Password))
		return invalid
	}
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		return invalid
	}

	token := randomToken()
	if err := insertSession(r.Context(), h.DB, u.ID, token); err != nil {
		return err
	}
	_, _ = h.DB.Exec(r.Context(), `DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()`, u.ID)
	h.issueCookies(w, r, token)
	httpx.JSON(w, http.StatusOK, map[string]any{"user": u})
	return nil
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) error {
	if c, err := r.Cookie(SessionCookie); err == nil && c.Value != "" {
		if _, err := h.DB.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, hashToken(c.Value)); err != nil {
			return err
		}
	}
	h.setCookie(w, SessionCookie, "", true, -1)
	httpx.NoContent(w)
	return nil
}

func (h *Handler) csrf(w http.ResponseWriter, r *http.Request) error {
	token := ""
	if c, err := r.Cookie(CSRFCookie); err == nil && len(c.Value) >= 32 {
		token = c.Value
	} else {
		token = randomToken()
		h.setCookie(w, CSRFCookie, token, false, int(sessionTTL.Seconds()))
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, http.StatusOK, map[string]string{"csrf_token": token})
	return nil
}

func (h *Handler) issueCookies(w http.ResponseWriter, r *http.Request, sessionToken string) {
	h.setCookie(w, SessionCookie, sessionToken, true, int(sessionTTL.Seconds()))
	if c, err := r.Cookie(CSRFCookie); err != nil || len(c.Value) < 32 {
		h.setCookie(w, CSRFCookie, randomToken(), false, int(sessionTTL.Seconds()))
	}
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) error {
	httpx.JSON(w, http.StatusOK, map[string]any{"user": CurrentUser(r.Context())})
	return nil
}

type updateMeReq struct {
	Name string `json:"name"`
}

func (h *Handler) updateMe(w http.ResponseWriter, r *http.Request) error {
	var req updateMeReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Name = strings.TrimSpace(req.Name)
	v := httpx.NewValidator()
	v.Check(req.Name != "", "name", "Nama wajib diisi.")
	v.Check(utf8.RuneCountInString(req.Name) <= 80, "name", "Nama maksimal 80 karakter.")
	if err := v.Err(); err != nil {
		return err
	}
	var u User
	err := h.DB.QueryRow(r.Context(), `
		UPDATE users SET name = $2, updated_at = now() WHERE id = $1
		RETURNING id, name, email, created_at`, UserID(r.Context()), req.Name).
		Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": u})
	return nil
}

type changePasswordReq struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request) error {
	var req changePasswordReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	v := httpx.NewValidator()
	v.Check(req.CurrentPassword != "", "current_password", "Password lama wajib diisi.")
	validatePassword(v, "new_password", req.NewPassword)
	if err := v.Err(); err != nil {
		return err
	}
	userID := UserID(r.Context())
	var hash string
	if err := h.DB.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&hash); err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.CurrentPassword)) != nil {
		return httpx.FieldError("current_password", "Password lama tidak sesuai.")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcryptCost)
	if err != nil {
		return err
	}
	current, _ := r.Cookie(SessionCookie)
	err = pgx.BeginFunc(r.Context(), h.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, string(newHash)); err != nil {
			return err
		}

		_, err := tx.Exec(r.Context(), `DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, userID, hashToken(current.Value))
		return err
	})
	if err != nil {
		return err
	}
	httpx.NoContent(w)
	return nil
}

func insertSession(ctx context.Context, q db.Querier, userID, token string) error {
	_, err := q.Exec(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
		hashToken(token), userID, time.Now().Add(sessionTTL))
	return err
}

type seedCategory struct{ name, kind, icon, color string }

var defaultCategories = []seedCategory{
	{"Makan & Minum", "expense", "utensils", "peach"},
	{"Transportasi", "expense", "bus", "sky"},
	{"Belanja", "expense", "shopping-bag", "rose"},
	{"Tagihan", "expense", "receipt", "butter"},
	{"Hiburan", "expense", "gamepad-2", "lavender"},
	{"Kesehatan", "expense", "heart-pulse", "mint"},
	{"Pendidikan", "expense", "graduation-cap", "sage"},
	{"Lainnya", "expense", "shapes", "sand"},
	{"Gaji", "income", "briefcase", "mint"},
	{"Freelance", "income", "laptop", "sky"},
	{"Bonus", "income", "gift", "lavender"},
	{"Pemasukan Lain", "income", "coins", "butter"},
}

func seedCategories(ctx context.Context, tx pgx.Tx, userID string) error {
	names := make([]string, len(defaultCategories))
	kinds := make([]string, len(defaultCategories))
	icons := make([]string, len(defaultCategories))
	colors := make([]string, len(defaultCategories))
	for i, c := range defaultCategories {
		names[i], kinds[i], icons[i], colors[i] = c.name, c.kind, c.icon, c.color
	}

	_, err := tx.Exec(ctx, `
		INSERT INTO categories (user_id, name, type, icon, color, created_at, updated_at)
		SELECT $1, n, t, i, c, now() + o * interval '1 millisecond', now()
		FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) WITH ORDINALITY AS x(n, t, i, c, o)`,
		userID, names, kinds, icons, colors)
	return err
}
