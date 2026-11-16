package category

import (
	"context"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"budgetly/internal/auth"
	"budgetly/internal/catalog"
	"budgetly/internal/httpx"
	"budgetly/internal/platform/db"
)

type Handler struct{ DB *pgxpool.Pool }

func (h *Handler) Routes(r chi.Router) {
	r.Get("/categories", httpx.H(h.list))
	r.Post("/categories", httpx.H(h.create))
	r.Patch("/categories/{id}", httpx.H(h.update))
}

type Category struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Type       string    `json:"type"`
	Icon       string    `json:"icon"`
	Color      string    `json:"color"`
	IsArchived bool      `json:"is_archived"`
	UsageCount int64     `json:"usage_count"`
	CreatedAt  time.Time `json:"created_at"`
}

const notFoundMsg = "Kategori tidak ditemukan."

const selectSQL = `
SELECT c.id, c.name, c.type, c.icon, c.color, c.is_archived, c.created_at,
       (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id AND t.deleted_at IS NULL)
FROM categories c WHERE c.user_id = $1`

func scanAll(ctx context.Context, q db.Querier, sql string, args ...any) ([]Category, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Category{}
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Type, &c.Icon, &c.Color, &c.IsArchived, &c.CreatedAt, &c.UsageCount); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func get(ctx context.Context, q db.Querier, userID, id string) (*Category, error) {
	list, err := scanAll(ctx, q, selectSQL+` AND c.id = $2`, userID, id)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0], nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	userID := auth.UserID(r.Context())
	sql := selectSQL
	args := []any{userID}
	switch t := r.URL.Query().Get("type"); t {
	case "income", "expense":
		args = append(args, t)
		sql += ` AND c.type = $2`
	case "":
	default:
		return httpx.FieldError("type", "Tipe kategori harus income atau expense.")
	}
	if r.URL.Query().Get("include_archived") != "true" {
		sql += ` AND NOT c.is_archived`
	}
	sql += ` ORDER BY c.type DESC, c.is_archived, c.created_at, c.name`
	items, err := scanAll(r.Context(), h.DB, sql, args...)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items})
	return nil
}

type createReq struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Icon  string `json:"icon"`
	Color string `json:"color"`
}

func validateName(v *httpx.Validator, name string) {
	v.Check(name != "", "name", "Nama kategori wajib diisi.")
	v.Check(utf8.RuneCountInString(name) <= 40, "name", "Nama kategori maksimal 40 karakter.")
}

func duplicateErr() error {
	return httpx.FieldError("name", "Kategori dengan nama ini sudah ada.")
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var req createReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Icon == "" {
		req.Icon = "tag"
	}
	if req.Color == "" {
		req.Color = "lavender"
	}
	v := httpx.NewValidator()
	validateName(v, req.Name)
	v.Check(req.Type == "income" || req.Type == "expense", "type", "Pilih tipe pemasukan atau pengeluaran.")
	v.Check(catalog.ValidIcon(req.Icon), "icon", "Ikon tidak valid.")
	v.Check(catalog.ValidColor(req.Color), "color", "Warna tidak valid.")
	if err := v.Err(); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	var id string
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO categories (user_id, name, type, icon, color) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		userID, req.Name, req.Type, req.Icon, req.Color).Scan(&id)
	if db.IsUniqueViolation(err, "categories_active_name_key") {
		return duplicateErr()
	}
	if err != nil {
		return err
	}
	c, err := get(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, c)
	return nil
}

type updateReq struct {
	Name       httpx.Optional[string] `json:"name"`
	Icon       httpx.Optional[string] `json:"icon"`
	Color      httpx.Optional[string] `json:"color"`
	IsArchived httpx.Optional[bool]   `json:"is_archived"`
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", notFoundMsg)
	if err != nil {
		return err
	}
	var req updateReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	cur, err := get(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	if cur == nil {
		return httpx.NotFound(notFoundMsg)
	}
	v := httpx.NewValidator()
	if req.Name.Set {
		cur.Name = strings.TrimSpace(req.Name.Value)
		validateName(v, cur.Name)
	}
	if req.Icon.Set {
		cur.Icon = req.Icon.Value
		v.Check(catalog.ValidIcon(cur.Icon), "icon", "Ikon tidak valid.")
	}
	if req.Color.Set {
		cur.Color = req.Color.Value
		v.Check(catalog.ValidColor(cur.Color), "color", "Warna tidak valid.")
	}
	if req.IsArchived.Set {
		cur.IsArchived = req.IsArchived.Value
	}
	if err := v.Err(); err != nil {
		return err
	}
	_, err = h.DB.Exec(r.Context(), `
		UPDATE categories SET name = $3, icon = $4, color = $5, is_archived = $6, updated_at = now()
		WHERE id = $1 AND user_id = $2`, id, userID, cur.Name, cur.Icon, cur.Color, cur.IsArchived)
	if db.IsUniqueViolation(err, "categories_active_name_key") {
		return duplicateErr()
	}
	if err != nil {
		return err
	}
	c, err := get(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, c)
	return nil
}
