package goal

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"budgetly/internal/auth"
	"budgetly/internal/catalog"
	"budgetly/internal/finance"
	"budgetly/internal/httpx"
	"budgetly/internal/ledger"
	"budgetly/internal/platform/db"
)

type Handler struct{ DB *pgxpool.Pool }

func (h *Handler) Routes(r chi.Router) {
	r.Get("/savings-goals", httpx.H(h.list))
	r.Post("/savings-goals", httpx.H(h.create))
	r.Get("/savings-goals/{id}", httpx.H(h.get))
	r.Patch("/savings-goals/{id}", httpx.H(h.update))
	r.Get("/savings-goals/{id}/allocations", httpx.H(h.listAllocations))
	r.Post("/savings-goals/{id}/allocations", httpx.H(h.allocate))
}

type Goal struct {
	ID              string    `json:"id"`
	Title           string    `json:"title"`
	TargetAmountIDR int64     `json:"target_amount_idr"`
	TargetDate      *string   `json:"target_date"`
	Status          string    `json:"status"`
	Icon            string    `json:"icon"`
	Color           string    `json:"color"`
	SavedIDR        int64     `json:"saved_idr"`
	RemainingIDR    int64     `json:"remaining_idr"`
	ProgressPct     float64   `json:"progress_pct"`
	IsCompleted     bool      `json:"is_completed"`
	CreatedAt       time.Time `json:"created_at"`
}

const notFoundMsg = "Goal tabungan tidak ditemukan."

const selectSQL = `
SELECT g.id, g.title, g.target_amount_idr, g.target_date, g.status, g.icon, g.color, g.created_at,
       COALESCE(SUM(CASE WHEN a.type = 'allocate' THEN a.amount_idr ELSE -a.amount_idr END), 0)::bigint
FROM savings_goals g
LEFT JOIN goal_allocations a ON a.goal_id = g.id
WHERE g.user_id = $1`

func query(ctx context.Context, q db.Querier, filter string, args ...any) ([]Goal, error) {
	rows, err := q.Query(ctx, selectSQL+filter+` GROUP BY g.id ORDER BY g.status, g.created_at`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Goal{}
	for rows.Next() {
		var g Goal
		var target *time.Time
		if err := rows.Scan(&g.ID, &g.Title, &g.TargetAmountIDR, &target, &g.Status, &g.Icon, &g.Color,
			&g.CreatedAt, &g.SavedIDR); err != nil {
			return nil, err
		}
		if target != nil {
			s := target.Format("2006-01-02")
			g.TargetDate = &s
		}
		g.RemainingIDR = max(0, g.TargetAmountIDR-g.SavedIDR)
		g.ProgressPct = finance.GoalProgressPct(g.SavedIDR, g.TargetAmountIDR)
		g.IsCompleted = g.SavedIDR >= g.TargetAmountIDR
		out = append(out, g)
	}
	return out, rows.Err()
}

func List(ctx context.Context, q db.Querier, userID, status string) ([]Goal, error) {
	if status == "all" {
		return query(ctx, q, "", userID)
	}
	return query(ctx, q, ` AND g.status = $2`, userID, status)
}

func getOne(ctx context.Context, q db.Querier, userID, id string) (*Goal, error) {
	list, err := query(ctx, q, ` AND g.id = $2`, userID, id)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	return &list[0], nil
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "active"
	}
	if status != "active" && status != "archived" && status != "all" {
		return httpx.FieldError("status", "Status harus active, archived, atau all.")
	}
	userID := auth.UserID(r.Context())
	items, err := List(r.Context(), h.DB, userID, status)
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
	g, err := getOne(r.Context(), h.DB, auth.UserID(r.Context()), id)
	if err != nil {
		return err
	}
	if g == nil {
		return httpx.NotFound(notFoundMsg)
	}
	httpx.JSON(w, http.StatusOK, g)
	return nil
}

func validateTitle(v *httpx.Validator, title string) {
	v.Check(title != "", "title", "Nama goal wajib diisi.")
	v.Check(utf8.RuneCountInString(title) <= 60, "title", "Nama goal maksimal 60 karakter.")
}

func parseTargetDate(v *httpx.Validator, raw string) *time.Time {
	d, err := time.Parse("2006-01-02", raw)
	if err != nil {
		v.Add("target_date", "Format tanggal tidak valid.")
		return nil
	}
	v.Check(!d.Before(finance.Today(time.Now())), "target_date", "Tenggat tidak boleh di masa lalu.")
	v.Check(d.Year() <= 2100, "target_date", "Tenggat terlalu jauh.")
	return &d
}

type createReq struct {
	Title           string  `json:"title"`
	TargetAmountIDR int64   `json:"target_amount_idr"`
	TargetDate      *string `json:"target_date"`
	Icon            string  `json:"icon"`
	Color           string  `json:"color"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) error {
	var req createReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Icon == "" {
		req.Icon = "piggy-bank"
	}
	if req.Color == "" {
		req.Color = "mint"
	}
	v := httpx.NewValidator()
	validateTitle(v, req.Title)
	v.Check(finance.ValidAmount(req.TargetAmountIDR), "target_amount_idr", "Target harus lebih dari 0.")
	v.Check(catalog.ValidIcon(req.Icon), "icon", "Ikon tidak valid.")
	v.Check(catalog.ValidColor(req.Color), "color", "Warna tidak valid.")
	var target *time.Time
	if req.TargetDate != nil && *req.TargetDate != "" {
		target = parseTargetDate(v, *req.TargetDate)
	}
	if err := v.Err(); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	var id string
	err := h.DB.QueryRow(r.Context(), `
		INSERT INTO savings_goals (user_id, title, target_amount_idr, target_date, icon, color)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		userID, req.Title, req.TargetAmountIDR, target, req.Icon, req.Color).Scan(&id)
	if err != nil {
		return err
	}
	g, err := getOne(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, g)
	return nil
}

type updateReq struct {
	Title            httpx.Optional[string] `json:"title"`
	TargetAmountIDR  httpx.Optional[int64]  `json:"target_amount_idr"`
	TargetDate       httpx.Optional[string] `json:"target_date"`
	Icon             httpx.Optional[string] `json:"icon"`
	Color            httpx.Optional[string] `json:"color"`
	Status           httpx.Optional[string] `json:"status"`
	ReleaseRemaining bool                   `json:"release_remaining"`
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
	ctx := r.Context()

	err = pgx.BeginFunc(ctx, h.DB, func(tx pgx.Tx) error {

		if err := db.LockUser(ctx, tx, userID); err != nil {
			return err
		}
		g, err := getOne(ctx, tx, userID, id)
		if err != nil {
			return err
		}
		if g == nil {
			return httpx.NotFound(notFoundMsg)
		}
		v := httpx.NewValidator()
		title, amount, icon, color, status := g.Title, g.TargetAmountIDR, g.Icon, g.Color, g.Status
		var target *time.Time
		if g.TargetDate != nil {
			d, _ := time.Parse("2006-01-02", *g.TargetDate)
			target = &d
		}
		if req.Title.Set {
			title = strings.TrimSpace(req.Title.Value)
			validateTitle(v, title)
		}
		if req.TargetAmountIDR.Set {
			amount = req.TargetAmountIDR.Value
			v.Check(finance.ValidAmount(amount), "target_amount_idr", "Target harus lebih dari 0.")

			v.Check(amount >= g.SavedIDR, "target_amount_idr",
				"Target tidak boleh lebih kecil dari dana terkumpul ("+finance.FormatIDR(g.SavedIDR)+").")
		}
		if req.TargetDate.Set {
			if req.TargetDate.Null || req.TargetDate.Value == "" {
				target = nil
			} else if g.TargetDate == nil || *g.TargetDate != req.TargetDate.Value {
				target = parseTargetDate(v, req.TargetDate.Value)
			}
		}
		if req.Icon.Set {
			icon = req.Icon.Value
			v.Check(catalog.ValidIcon(icon), "icon", "Ikon tidak valid.")
		}
		if req.Color.Set {
			color = req.Color.Value
			v.Check(catalog.ValidColor(color), "color", "Warna tidak valid.")
		}
		if req.Status.Set {
			status = req.Status.Value
			v.Check(status == "active" || status == "archived", "status", "Status tidak valid.")
		}
		if err := v.Err(); err != nil {
			return err
		}

		if status == "archived" && g.Status != "archived" && g.SavedIDR > 0 {
			if !req.ReleaseRemaining {
				return httpx.Conflict("goal_has_funds",
					"Lepaskan dana "+finance.FormatIDR(g.SavedIDR)+" dulu sebelum mengarsipkan goal ini.")
			}

			if _, err := tx.Exec(ctx, `
				INSERT INTO goal_allocations (user_id, goal_id, type, amount_idr, note)
				VALUES ($1, $2, 'release', $3, 'Dilepas saat goal diarsipkan')`, userID, id, g.SavedIDR); err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, `
			UPDATE savings_goals SET title = $3, target_amount_idr = $4, target_date = $5, icon = $6,
			       color = $7, status = $8, updated_at = now()
			WHERE id = $1 AND user_id = $2`, id, userID, title, amount, target, icon, color, status)
		return err
	})
	if err != nil {
		return err
	}
	g, err := getOne(ctx, h.DB, userID, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, g)
	return nil
}

type Allocation struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"`
	AmountIDR  int64     `json:"amount_idr"`
	Note       string    `json:"note"`
	OccurredAt time.Time `json:"occurred_at"`
}

func (h *Handler) listAllocations(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", notFoundMsg)
	if err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	g, err := getOne(r.Context(), h.DB, userID, id)
	if err != nil {
		return err
	}
	if g == nil {
		return httpx.NotFound(notFoundMsg)
	}
	rows, err := h.DB.Query(r.Context(), `
		SELECT id, type, amount_idr, note, occurred_at FROM goal_allocations
		WHERE goal_id = $1 AND user_id = $2 ORDER BY occurred_at DESC, created_at DESC LIMIT 100`, id, userID)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []Allocation{}
	for rows.Next() {
		var a Allocation
		if err := rows.Scan(&a.ID, &a.Type, &a.AmountIDR, &a.Note, &a.OccurredAt); err != nil {
			return err
		}
		items = append(items, a)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"goal": g, "items": items})
	return nil
}

type allocateReq struct {
	Type      string `json:"type"`
	AmountIDR int64  `json:"amount_idr"`
	Note      string `json:"note"`
}

func amountErr(code, msg string) error {
	return &httpx.Error{Status: http.StatusUnprocessableEntity, Code: code, Message: msg,
		Fields: map[string]string{"amount_idr": msg}}
}

func (h *Handler) allocate(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", notFoundMsg)
	if err != nil {
		return err
	}
	var req allocateReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Note = strings.TrimSpace(req.Note)
	v := httpx.NewValidator()
	kind := finance.AllocationType(req.Type)
	v.Check(kind == finance.Allocate || kind == finance.Release, "type", "Pilih alokasikan atau lepaskan.")
	v.Check(finance.ValidAmount(req.AmountIDR), "amount_idr", "Nominal harus lebih dari 0.")
	v.Check(utf8.RuneCountInString(req.Note) <= 280, "note", "Catatan maksimal 280 karakter.")
	if err := v.Err(); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	ctx := r.Context()

	err = pgx.BeginFunc(ctx, h.DB, func(tx pgx.Tx) error {
		if err := db.LockUser(ctx, tx, userID); err != nil {
			return err
		}
		g, err := getOne(ctx, tx, userID, id)
		if err != nil {
			return err
		}
		if g == nil {
			return httpx.NotFound(notFoundMsg)
		}
		if g.Status != "active" {
			return httpx.Unprocessable("goal_archived", "Goal ini sudah diarsipkan.")
		}
		snap, err := ledger.GetSnapshot(ctx, tx, userID)
		if err != nil {
			return err
		}
		switch err := finance.CheckAllocation(kind, req.AmountIDR, g.SavedIDR, g.TargetAmountIDR, snap.AvailableToSpendIDR); {
		case errors.Is(err, finance.ErrExceedsAvailable):
			return amountErr("insufficient_available",
				"Dana yang bisa dialokasikan hanya "+finance.FormatIDR(max(0, snap.AvailableToSpendIDR))+".")
		case errors.Is(err, finance.ErrExceedsTarget):
			return amountErr("exceeds_target",
				"Maksimal "+finance.FormatIDR(g.TargetAmountIDR-g.SavedIDR)+" lagi untuk mencapai target.")
		case errors.Is(err, finance.ErrExceedsSaved):
			return amountErr("exceeds_saved",
				"Dana di goal ini hanya "+finance.FormatIDR(g.SavedIDR)+".")
		case err != nil:
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO goal_allocations (user_id, goal_id, type, amount_idr, note) VALUES ($1, $2, $3, $4, $5)`,
			userID, id, string(kind), req.AmountIDR, req.Note)
		return err
	})
	if err != nil {
		return err
	}
	g, err := getOne(ctx, h.DB, userID, id)
	if err != nil {
		return err
	}
	snap, err := ledger.GetSnapshot(ctx, h.DB, userID)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"goal": g, "summary": snap})
	return nil
}
