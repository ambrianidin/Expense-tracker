package account

import (
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
)

type Handler struct{ DB *pgxpool.Pool }

func (h *Handler) Routes(r chi.Router) {
	r.Get("/accounts", httpx.H(h.list))
	r.Post("/accounts", httpx.H(h.create))
	r.Get("/accounts/{id}", httpx.H(h.get))
	r.Patch("/accounts/{id}", httpx.H(h.update))
}

var validTypes = map[string]bool{"cash": true, "bank": true, "ewallet": true}

const notFoundMsg = "Akun tidak ditemukan."

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	userID := auth.UserID(r.Context())
	includeArchived := r.URL.Query().Get("include_archived") == "true"
	items, err := ledger.ListAccounts(r.Context(), h.DB, userID, includeArchived)
	if err != nil {
		return err
	}
	snap, err := ledger.GetSnapshot(r.Context(), h.DB, userID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "summary": snap})
	return nil
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", notFoundMsg)
	if err != nil {
		return err
	}
	a, err := ledger.GetAccount(r.Context(), h.DB, auth.UserID(r.Context()), id)
	if ledger.IsNotFound(err) {
		return httpx.NotFound(notFoundMsg)
	}
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a)
	return nil
}

type createReq struct {
	Name              string `json:"name"`
	Type              string `json:"type"`
	OpeningBalanceIDR int64  `json:"opening_balance_idr"`
	OpeningDate       string `json:"opening_date"`
}

func validateName(v *httpx.Validator, name string) {
	v.Check(name != "", "name", "Nama akun wajib diisi.")
	v.Check(utf8.RuneCountInString(name) <= 60, "name", "Nama akun maksimal 60 karakter.")
}

func validateOpening(v *httpx.Validator, amount int64) {
	v.Check(amount >= 0, "opening_balance_idr", "Saldo awal tidak boleh negatif.")
	v.Check(amount <= finance.MaxAmount, "opening_balance_idr", "Saldo awal terlalu besar.")
}

func parseOpeningDate(v *httpx.Validator, s string) time.Time {
	if s == "" {
		return finance.Today(time.Now())
	}
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		v.Add("opening_date", "Format tanggal tidak valid.")
		return d
	}
	v.Check(!d.After(finance.Today(time.Now())), "opening_date", "Tanggal saldo awal tidak boleh di masa depan.")
	v.Check(d.Year() >= 2000, "opening_date", "Tanggal terlalu lama.")
	return d
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var req createReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Name = strings.TrimSpace(req.Name)
	v := httpx.NewValidator()
	validateName(v, req.Name)
	v.Check(validTypes[req.Type], "type", "Pilih jenis akun: cash, bank, atau e-wallet.")
	validateOpening(v, req.OpeningBalanceIDR)
	date := parseOpeningDate(v, req.OpeningDate)
	if err := v.Err(); err != nil {
		return err
	}

	userID := auth.UserID(r.Context())
	var id string
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO accounts (user_id, name, type, opening_balance_idr, opening_date)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		userID, req.Name, req.Type, req.OpeningBalanceIDR, date).Scan(&id)
	if err != nil {
		return err
	}
	a, err := ledger.GetAccount(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, a)
	return nil
}

type updateReq struct {
	Name               httpx.Optional[string] `json:"name"`
	Type               httpx.Optional[string] `json:"type"`
	OpeningBalanceIDR  httpx.Optional[int64]  `json:"opening_balance_idr"`
	OpeningDate        httpx.Optional[string] `json:"opening_date"`
	IsArchived         httpx.Optional[bool]   `json:"is_archived"`
	ConfirmRecalculate bool                   `json:"confirm_recalculate"`
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
	cur, err := ledger.GetAccount(r.Context(), h.DB, userID, id)
	if ledger.IsNotFound(err) {
		return httpx.NotFound(notFoundMsg)
	}
	if err != nil {
		return err
	}

	v := httpx.NewValidator()
	name, kind, opening, archived := cur.Name, cur.Type, cur.OpeningBalanceIDR, cur.IsArchived
	date, _ := time.Parse("2006-01-02", cur.OpeningDate)
	if req.Name.Set {
		name = strings.TrimSpace(req.Name.Value)
		validateName(v, name)
	}
	if req.Type.Set {
		kind = req.Type.Value
		v.Check(validTypes[kind], "type", "Pilih jenis akun: cash, bank, atau e-wallet.")
	}
	if req.OpeningBalanceIDR.Set {
		v.Check(!req.OpeningBalanceIDR.Null, "opening_balance_idr", "Saldo awal wajib diisi.")
		opening = req.OpeningBalanceIDR.Value
		validateOpening(v, opening)
	}
	if req.OpeningDate.Set && !req.OpeningDate.Null {
		date = parseOpeningDate(v, req.OpeningDate.Value)
	}
	if req.IsArchived.Set {
		archived = req.IsArchived.Value
	}
	if err := v.Err(); err != nil {
		return err
	}

	if opening != cur.OpeningBalanceIDR && cur.HasActivity && !req.ConfirmRecalculate {
		return httpx.Conflict("confirmation_required",
			"Akun ini sudah punya transaksi. Mengubah saldo awal akan menghitung ulang seluruh saldo. Konfirmasi untuk melanjutkan.")
	}

	_, err = h.DB.Exec(r.Context(), `
		UPDATE accounts SET name = $3, type = $4, opening_balance_idr = $5, opening_date = $6,
		       is_archived = $7, updated_at = now()
		WHERE id = $1 AND user_id = $2`, id, userID, name, kind, opening, date, archived)
	if err != nil {
		return err
	}
	a, err := ledger.GetAccount(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, a)
	return nil
}
