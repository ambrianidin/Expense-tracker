package transfer

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
	r.Get("/transfers", httpx.H(h.list))
	r.Post("/transfers", httpx.H(h.create))
	r.Delete("/transfers/{id}", httpx.H(h.delete))
}

type AccountRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type Item struct {
	ID          string     `json:"id"`
	AmountIDR   int64      `json:"amount_idr"`
	OccurredAt  time.Time  `json:"occurred_at"`
	Note        string     `json:"note"`
	CreatedAt   time.Time  `json:"created_at"`
	FromAccount AccountRef `json:"from_account"`
	ToAccount   AccountRef `json:"to_account"`
}

const notFoundMsg = "Transfer tidak ditemukan."

const selectSQL = `
SELECT tr.id, tr.amount_idr, tr.occurred_at, tr.note, tr.created_at,
       fa.id, fa.name, fa.type, ta.id, ta.name, ta.type
FROM transfers tr
JOIN accounts fa ON fa.id = tr.from_account_id
JOIN accounts ta ON ta.id = tr.to_account_id
WHERE tr.user_id = $1 AND tr.deleted_at IS NULL`

func scan(ctx context.Context, q db.Querier, sql string, args ...any) ([]Item, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.AmountIDR, &it.OccurredAt, &it.Note, &it.CreatedAt,
			&it.FromAccount.ID, &it.FromAccount.Name, &it.FromAccount.Type,
			&it.ToAccount.ID, &it.ToAccount.Name, &it.ToAccount.Type); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	userID := auth.UserID(r.Context())
	accountID := r.URL.Query().Get("account_id")
	if accountID != "" && !httpx.IsUUID(accountID) {
		return httpx.FieldError("account_id", "Akun tidak valid.")
	}
	page, size := httpx.Page(r, 20, 100)
	sql := selectSQL
	countSQL := `SELECT COUNT(*) FROM transfers tr WHERE tr.user_id = $1 AND tr.deleted_at IS NULL`
	args := []any{userID}
	if accountID != "" {
		args = append(args, accountID)
		filter := ` AND (tr.from_account_id = $2 OR tr.to_account_id = $2)`
		sql += filter
		countSQL += filter
	}
	var total int64
	if err := h.DB.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
		return err
	}
	n := len(args)
	args = append(args, size, (page-1)*size)
	sql += fmt.Sprintf(` ORDER BY tr.occurred_at DESC, tr.created_at DESC LIMIT $%d OFFSET $%d`, n+1, n+2)
	items, err := scan(r.Context(), h.DB, sql, args...)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "page": page, "page_size": size, "total": total})
	return nil
}

type createReq struct {
	FromAccountID string `json:"from_account_id"`
	ToAccountID   string `json:"to_account_id"`
	AmountIDR     int64  `json:"amount_idr"`
	OccurredAt    string `json:"occurred_at"`
	Note          string `json:"note"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var req createReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	req.FromAccountID = strings.ToLower(req.FromAccountID)
	req.ToAccountID = strings.ToLower(req.ToAccountID)
	req.Note = strings.TrimSpace(req.Note)

	v := httpx.NewValidator()
	v.Check(finance.ValidAmount(req.AmountIDR), "amount_idr", "Nominal harus lebih dari 0.")
	v.Check(utf8.RuneCountInString(req.Note) <= 280, "note", "Catatan maksimal 280 karakter.")
	occurredAt := ledger.ParseOccurredAt(v, "occurred_at", req.OccurredAt)

	if err := ledger.RequireActiveAccount(r.Context(), h.DB, v, "from_account_id", userID, req.FromAccountID, false); err != nil {
		return err
	}
	if err := ledger.RequireActiveAccount(r.Context(), h.DB, v, "to_account_id", userID, req.ToAccountID, false); err != nil {
		return err
	}
	v.Check(req.FromAccountID == "" || req.FromAccountID != req.ToAccountID, "to_account_id", "Akun tujuan harus berbeda dari akun asal.")
	if err := v.Err(); err != nil {
		return err
	}

	var id string
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO transfers (user_id, from_account_id, to_account_id, amount_idr, occurred_at, note)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		userID, req.FromAccountID, req.ToAccountID, req.AmountIDR, occurredAt, req.Note).Scan(&id)
	if db.IsForeignKeyViolation(err) || db.IsCheckViolation(err) {
		return httpx.FieldError("to_account_id", "Akun transfer tidak valid.")
	}
	if err != nil {
		return err
	}
	items, err := scan(r.Context(), h.DB, selectSQL+` AND tr.id = $2`, userID, id)
	if err != nil {
		return err
	}
	warnings, err := ledger.ComputeWarnings(r.Context(), h.DB, userID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"transfer": items[0], "warnings": warnings})
	return nil
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", notFoundMsg)
	if err != nil {
		return err
	}
	tag, err := h.DB.Exec(r.Context(), `
		UPDATE transfers SET deleted_at = now(), updated_at = now()
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
