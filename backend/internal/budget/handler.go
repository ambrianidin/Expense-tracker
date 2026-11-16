package budget

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"budgetly/internal/auth"
	"budgetly/internal/finance"
	"budgetly/internal/httpx"
	"budgetly/internal/platform/db"
)

type Handler struct{ DB *pgxpool.Pool }

func (h *Handler) Routes(r chi.Router) {
	r.Get("/budgets", httpx.H(h.list))
	r.Post("/budgets", httpx.H(h.create))
	r.Patch("/budgets/{id}", httpx.H(h.update))
	r.Delete("/budgets/{id}", httpx.H(h.delete))
}

type CategoryRef struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Icon       string `json:"icon"`
	Color      string `json:"color"`
	IsArchived bool   `json:"is_archived"`
}

type Item struct {
	ID       string      `json:"id"`
	Month    string      `json:"month"`
	Category CategoryRef `json:"category"`
	finance.BudgetProgress
	CreatedAt time.Time `json:"created_at"`
}

type Totals struct {
	LimitIDR     int64   `json:"limit_idr"`
	SpentIDR     int64   `json:"spent_idr"`
	RemainingIDR int64   `json:"remaining_idr"`
	UsagePct     float64 `json:"usage_pct"`
}

const notFoundMsg = "Budget tidak ditemukan."

const listSQL = `
SELECT b.id, b.limit_idr, b.created_at, c.id, c.name, c.icon, c.color, c.is_archived,
       COALESCE(s.spent, 0)::bigint
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN LATERAL (
  SELECT SUM(t.amount_idr) AS spent FROM transactions t
  WHERE t.user_id = b.user_id AND t.category_id = b.category_id AND t.type = 'expense'
    AND t.deleted_at IS NULL AND t.occurred_at >= $3 AND t.occurred_at < $4
) s ON true
WHERE b.user_id = $1 AND b.month_start = $2`

func ListWithProgress(ctx context.Context, q db.Querier, userID string, m finance.Month) ([]Item, Totals, error) {
	return query(ctx, q, listSQL+` ORDER BY COALESCE(s.spent, 0)::numeric / b.limit_idr DESC, c.name`, userID, m)
}

func query(ctx context.Context, q db.Querier, sql string, userID string, m finance.Month, extra ...any) ([]Item, Totals, error) {
	args := append([]any{userID, m.Date(), m.Start(), m.End()}, extra...)
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, Totals{}, err
	}
	defer rows.Close()
	items := []Item{}
	var t Totals
	for rows.Next() {
		var it Item
		var limit, spent int64
		if err := rows.Scan(&it.ID, &limit, &it.CreatedAt, &it.Category.ID, &it.Category.Name,
			&it.Category.Icon, &it.Category.Color, &it.Category.IsArchived, &spent); err != nil {
			return nil, t, err
		}
		it.Month = m.String()
		it.BudgetProgress = finance.ComputeBudget(limit, spent)
		t.LimitIDR += limit
		t.SpentIDR += spent
		items = append(items, it)
	}
	t.RemainingIDR = t.LimitIDR - t.SpentIDR
	if t.LimitIDR > 0 {
		t.UsagePct = finance.Round2(float64(t.SpentIDR) * 100 / float64(t.LimitIDR))
	}
	return items, t, rows.Err()
}

func monthParam(r *http.Request) (finance.Month, error) {
	raw := r.URL.Query().Get("month")
	if raw == "" {
		return finance.MonthOf(time.Now()), nil
	}
	m, err := finance.ParseMonth(raw)
	if err != nil {
		return m, httpx.FieldError("month", "Format bulan harus YYYY-MM.")
	}
	return m, nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	m, err := monthParam(r)
	if err != nil {
		return err
	}
	items, totals, err := ListWithProgress(r.Context(), h.DB, auth.UserID(r.Context()), m)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"month": m.String(), "items": items, "totals": totals})
	return nil
}

func (h *Handler) getOne(ctx context.Context, userID, id string) (*Item, error) {
	var monthStart time.Time
	err := h.DB.QueryRow(ctx, `SELECT month_start FROM budgets WHERE id = $1 AND user_id = $2`, id, userID).Scan(&monthStart)
	if db.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	m := finance.Month{Year: monthStart.Year(), Month: monthStart.Month()}
	items, _, err := query(ctx, h.DB, listSQL+` AND b.id = $5`, userID, m, id)
	if err != nil || len(items) == 0 {
		return nil, err
	}
	return &items[0], nil
}

type createReq struct {
	CategoryID string `json:"category_id"`
	Month      string `json:"month"`
	LimitIDR   int64  `json:"limit_idr"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var req createReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	req.CategoryID = strings.ToLower(req.CategoryID)
	v := httpx.NewValidator()
	m, err := finance.ParseMonth(req.Month)
	v.Check(err == nil, "month", "Pilih bulan.")
	v.Check(finance.ValidAmount(req.LimitIDR), "limit_idr", "Batas budget harus lebih dari 0.")
	if !httpx.IsUUID(req.CategoryID) {
		v.Add("category_id", "Pilih kategori pengeluaran.")
	} else {
		var kind string
		var archived bool
		err := h.DB.QueryRow(r.Context(), `SELECT type, is_archived FROM categories WHERE id = $1 AND user_id = $2`,
			req.CategoryID, userID).Scan(&kind, &archived)
		switch {
		case db.IsNoRows(err):
			v.Add("category_id", "Kategori tidak ditemukan.")
		case err != nil:
			return err
		default:
			v.Check(kind == "expense", "category_id", "Budget hanya untuk kategori pengeluaran.")
			v.Check(!archived, "category_id", "Kategori ini sudah diarsipkan.")
		}
	}
	if err := v.Err(); err != nil {
		return err
	}
	var id string
	err = h.DB.QueryRow(r.Context(), `
		INSERT INTO budgets (user_id, category_id, month_start, limit_idr) VALUES ($1, $2, $3, $4) RETURNING id`,
		userID, req.CategoryID, m.Date(), req.LimitIDR).Scan(&id)
	if db.IsUniqueViolation(err, "budgets_user_category_month_key") {

		return &httpx.Error{Status: http.StatusConflict, Code: "budget_exists",
			Message: "Budget untuk kategori ini di bulan tersebut sudah ada.",
			Fields:  map[string]string{"category_id": "Kategori ini sudah punya budget di bulan tersebut."}}
	}
	if err != nil {
		return err
	}
	it, err := h.getOne(r.Context(), userID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, it)
	return nil
}

type updateReq struct {
	LimitIDR int64 `json:"limit_idr"`
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
	if !finance.ValidAmount(req.LimitIDR) {
		return httpx.FieldError("limit_idr", "Batas budget harus lebih dari 0.")
	}
	userID := auth.UserID(r.Context())
	tag, err := h.DB.Exec(r.Context(), `UPDATE budgets SET limit_idr = $3, updated_at = now() WHERE id = $1 AND user_id = $2`,
		id, userID, req.LimitIDR)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpx.NotFound(notFoundMsg)
	}
	it, err := h.getOne(r.Context(), userID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, it)
	return nil
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", notFoundMsg)
	if err != nil {
		return err
	}
	tag, err := h.DB.Exec(r.Context(), `DELETE FROM budgets WHERE id = $1 AND user_id = $2`, id, auth.UserID(r.Context()))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpx.NotFound(notFoundMsg)
	}
	httpx.NoContent(w)
	return nil
}
