package transaction

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"budgetly/internal/auth"
	"budgetly/internal/finance"
	"budgetly/internal/httpx"
	"budgetly/internal/ledger"
	"budgetly/internal/platform/db"
)

type Handler struct{ DB *pgxpool.Pool }

func (h *Handler) Routes(r chi.Router) {
	r.Get("/transactions", httpx.H(h.list))
	r.Post("/transactions", httpx.H(h.create))
	r.Get("/transactions/{id}", httpx.H(h.get))
	r.Patch("/transactions/{id}", httpx.H(h.update))
	r.Delete("/transactions/{id}", httpx.H(h.delete))
}

type AccountRef struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	IsArchived bool   `json:"is_archived"`
}

type CategoryRef struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Icon       string `json:"icon"`
	Color      string `json:"color"`
	IsArchived bool   `json:"is_archived"`
}

type Item struct {
	ID         string      `json:"id"`
	Type       string      `json:"type"`
	AmountIDR  int64       `json:"amount_idr"`
	OccurredAt time.Time   `json:"occurred_at"`
	Note       string      `json:"note"`
	CreatedAt  time.Time   `json:"created_at"`
	UpdatedAt  time.Time   `json:"updated_at"`
	Account    AccountRef  `json:"account"`
	Category   CategoryRef `json:"category"`
}

const notFoundMsg = "Transaksi tidak ditemukan."

const selectSQL = `
SELECT t.id, t.type, t.amount_idr, t.occurred_at, t.note, t.created_at, t.updated_at,
       a.id, a.name, a.type, a.is_archived,
       c.id, c.name, c.icon, c.color, c.is_archived
FROM transactions t
JOIN accounts a ON a.id = t.account_id
JOIN categories c ON c.id = t.category_id
WHERE t.user_id = $1 AND t.deleted_at IS NULL`

func scan(ctx context.Context, q db.Querier, sql string, args ...any) ([]Item, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.Type, &it.AmountIDR, &it.OccurredAt, &it.Note, &it.CreatedAt, &it.UpdatedAt,
			&it.Account.ID, &it.Account.Name, &it.Account.Type, &it.Account.IsArchived,
			&it.Category.ID, &it.Category.Name, &it.Category.Icon, &it.Category.Color, &it.Category.IsArchived); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func getOne(ctx context.Context, q db.Querier, userID, id string) (*Item, error) {
	items, err := scan(ctx, q, selectSQL+` AND t.id = $2`, userID, id)
	if err != nil || len(items) == 0 {
		return nil, err
	}
	return &items[0], nil
}

func ListRecent(ctx context.Context, q db.Querier, userID string, limit int) ([]Item, error) {
	return scan(ctx, q, selectSQL+` ORDER BY t.occurred_at DESC, t.created_at DESC LIMIT $2`, userID, limit)
}

type where struct {
	clauses []string
	args    []any
}

func (w *where) add(clause string, arg any) {
	w.args = append(w.args, arg)
	w.clauses = append(w.clauses, fmt.Sprintf(clause, len(w.args)))
}

func (w *where) sql() string {
	if len(w.clauses) == 0 {
		return ""
	}
	return " AND " + strings.Join(w.clauses, " AND ")
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	userID := auth.UserID(r.Context())
	qs := r.URL.Query()
	v := httpx.NewValidator()
	start, end := ledger.DateRange(v, qs.Get("month"), qs.Get("from"), qs.Get("to"))
	kind := qs.Get("type")
	v.Check(kind == "" || kind == "income" || kind == "expense", "type", "Tipe harus income atau expense.")
	accountID, categoryID := qs.Get("account_id"), qs.Get("category_id")
	v.Check(accountID == "" || httpx.IsUUID(accountID), "account_id", "Akun tidak valid.")
	v.Check(categoryID == "" || httpx.IsUUID(categoryID), "category_id", "Kategori tidak valid.")
	search := strings.TrimSpace(qs.Get("q"))
	v.Check(utf8.RuneCountInString(search) <= 100, "q", "Kata kunci terlalu panjang.")
	if err := v.Err(); err != nil {
		return err
	}

	f := &where{args: []any{userID}}
	if start != nil {
		f.add("t.occurred_at >= $%d", *start)
	}
	if end != nil {
		f.add("t.occurred_at < $%d", *end)
	}
	if kind != "" {
		f.add("t.type = $%d", kind)
	}
	if accountID != "" {
		f.add("t.account_id = $%d", accountID)
	}
	if categoryID != "" {
		f.add("t.category_id = $%d", categoryID)
	}
	if search != "" {
		f.add("(t.note ILIKE $%[1]d OR c.name ILIKE $%[1]d OR a.name ILIKE $%[1]d)", ledger.LikePattern(search))
	}

	var total, income, expense int64
	err := h.DB.QueryRow(r.Context(), `
		SELECT COUNT(*),
		       COALESCE(SUM(t.amount_idr) FILTER (WHERE t.type = 'income'), 0)::bigint,
		       COALESCE(SUM(t.amount_idr) FILTER (WHERE t.type = 'expense'), 0)::bigint
		FROM transactions t
		JOIN accounts a ON a.id = t.account_id
		JOIN categories c ON c.id = t.category_id
		WHERE t.user_id = $1 AND t.deleted_at IS NULL`+f.sql(), f.args...).Scan(&total, &income, &expense)
	if err != nil {
		return err
	}

	page, size := httpx.Page(r, 20, 100)
	args := append(f.args, size, (page-1)*size)
	items, err := scan(r.Context(), h.DB, selectSQL+f.sql()+
		fmt.Sprintf(` ORDER BY t.occurred_at DESC, t.created_at DESC LIMIT $%d OFFSET $%d`, len(args)-1, len(args)), args...)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"items":     items,
		"page":      page,
		"page_size": size,
		"total":     total,
		"totals":    map[string]int64{"income_idr": income, "expense_idr": expense, "net_idr": income - expense},
	})
	return nil
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", notFoundMsg)
	if err != nil {
		return err
	}
	it, err := getOne(r.Context(), h.DB, auth.UserID(r.Context()), id)
	if err != nil {
		return err
	}
	if it == nil {
		return httpx.NotFound(notFoundMsg)
	}
	httpx.JSON(w, http.StatusOK, it)
	return nil
}

type fields struct {
	kind, accountID, categoryID, note string
	amount                            int64
	occurredAt                        time.Time
}

func (h *Handler) validate(ctx context.Context, userID string, f *fields, v *httpx.Validator, keepAccount, keepCategory bool) error {
	v.Check(f.kind == "income" || f.kind == "expense", "type", "Pilih pemasukan atau pengeluaran.")
	v.Check(finance.ValidAmount(f.amount), "amount_idr", "Nominal harus lebih dari 0.")
	f.note = strings.TrimSpace(f.note)
	v.Check(utf8.RuneCountInString(f.note) <= 280, "note", "Catatan maksimal 280 karakter.")

	if err := ledger.RequireActiveAccount(ctx, h.DB, v, "account_id", userID, f.accountID, keepAccount); err != nil {
		return err
	}
	if !httpx.IsUUID(f.categoryID) {
		v.Add("category_id", "Pilih kategori.")
		return nil
	}
	var catType string
	var archived bool
	err := h.DB.QueryRow(ctx, `SELECT type, is_archived FROM categories WHERE id = $1 AND user_id = $2`, f.categoryID, userID).Scan(&catType, &archived)
	if db.IsNoRows(err) {
		v.Add("category_id", "Kategori tidak ditemukan.")
		return nil
	}
	if err != nil {
		return err
	}
	v.Check(catType == f.kind, "category_id", "Kategori tidak sesuai dengan jenis transaksi.")
	v.Check(!archived || keepCategory, "category_id", "Kategori ini sudah diarsipkan.")
	return nil
}

type createReq struct {
	Type       string `json:"type"`
	AccountID  string `json:"account_id"`
	CategoryID string `json:"category_id"`
	AmountIDR  int64  `json:"amount_idr"`
	OccurredAt string `json:"occurred_at"`
	Note       string `json:"note"`
}

func (h *Handler) respondWithWarnings(w http.ResponseWriter, r *http.Request, status int, userID, id string) error {
	it, err := getOne(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	warnings, err := ledger.ComputeWarnings(r.Context(), h.DB, userID)
	if err != nil {
		return err
	}
	httpx.JSON(w, status, map[string]any{"transaction": it, "warnings": warnings})
	return nil
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var req createReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	v := httpx.NewValidator()
	f := fields{kind: req.Type, accountID: req.AccountID, categoryID: req.CategoryID, amount: req.AmountIDR, note: req.Note}
	f.occurredAt = ledger.ParseOccurredAt(v, "occurred_at", req.OccurredAt)
	if err := h.validate(r.Context(), userID, &f, v, false, false); err != nil {
		return err
	}
	if err := v.Err(); err != nil {
		return err
	}
	var id string
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO transactions (user_id, account_id, category_id, type, amount_idr, occurred_at, note)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		userID, f.accountID, f.categoryID, f.kind, f.amount, f.occurredAt, f.note).Scan(&id)
	if err != nil {
		return mapWriteErr(err)
	}

	return h.respondWithWarnings(w, r, http.StatusCreated, userID, id)
}

type updateReq struct {
	Type       httpx.Optional[string] `json:"type"`
	AccountID  httpx.Optional[string] `json:"account_id"`
	CategoryID httpx.Optional[string] `json:"category_id"`
	AmountIDR  httpx.Optional[int64]  `json:"amount_idr"`
	OccurredAt httpx.Optional[string] `json:"occurred_at"`
	Note       httpx.Optional[string] `json:"note"`
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
	cur, err := getOne(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	if cur == nil {
		return httpx.NotFound(notFoundMsg)
	}
	v := httpx.NewValidator()
	f := fields{kind: cur.Type, accountID: cur.Account.ID, categoryID: cur.Category.ID,
		amount: cur.AmountIDR, occurredAt: cur.OccurredAt, note: cur.Note}
	if req.Type.Set {
		f.kind = req.Type.Value
	}
	if req.AccountID.Set {
		f.accountID = strings.ToLower(req.AccountID.Value)
	}
	if req.CategoryID.Set {
		f.categoryID = strings.ToLower(req.CategoryID.Value)
	}
	if req.AmountIDR.Set {
		f.amount = req.AmountIDR.Value
	}
	if req.OccurredAt.Set {
		f.occurredAt = ledger.ParseOccurredAt(v, "occurred_at", req.OccurredAt.Value)
	}
	if req.Note.Set {
		f.note = req.Note.Value
	}
	if err := h.validate(r.Context(), userID, &f, v, f.accountID == cur.Account.ID, f.categoryID == cur.Category.ID); err != nil {
		return err
	}
	if err := v.Err(); err != nil {
		return err
	}
	_, err = h.DB.Exec(r.Context(), `
		UPDATE transactions SET type = $3, account_id = $4, category_id = $5, amount_idr = $6,
		       occurred_at = $7, note = $8, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
		id, userID, f.kind, f.accountID, f.categoryID, f.amount, f.occurredAt, f.note)
	if err != nil {
		return mapWriteErr(err)
	}
	return h.respondWithWarnings(w, r, http.StatusOK, userID, id)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", notFoundMsg)
	if err != nil {
		return err
	}
	tag, err := h.DB.Exec(r.Context(), `
		UPDATE transactions SET deleted_at = now(), updated_at = now()
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, id, auth.UserID(r.Context()))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpx.NotFound(notFoundMsg)
	}
	httpx.NoContent(w)
	return nil
}

func mapWriteErr(err error) error {
	switch {
	case db.IsForeignKeyViolation(err):
		return httpx.FieldError("category_id", "Akun atau kategori tidak valid untuk transaksi ini.")
	case db.IsCheckViolation(err):
		return httpx.Unprocessable("validation_error", "Data transaksi tidak valid.")
	}
	return err
}
