package report

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"budgetly/internal/auth"
	"budgetly/internal/budget"
	"budgetly/internal/finance"
	"budgetly/internal/goal"
	"budgetly/internal/httpx"
	"budgetly/internal/ledger"
	"budgetly/internal/platform/db"
	"budgetly/internal/transaction"
)

type Handler struct{ DB *pgxpool.Pool }

func (h *Handler) Routes(r chi.Router) {
	r.Get("/dashboard/summary", httpx.H(h.summary))
	r.Get("/reports/monthly", httpx.H(h.monthly))
}

type CategorySlice struct {
	CategoryID string  `json:"category_id"`
	Name       string  `json:"name"`
	Icon       string  `json:"icon"`
	Color      string  `json:"color"`
	AmountIDR  int64   `json:"amount_idr"`
	Count      int64   `json:"count"`
	Pct        float64 `json:"pct"`
}

type MonthTotals struct {
	Month      string `json:"month"`
	IncomeIDR  int64  `json:"income_idr"`
	ExpenseIDR int64  `json:"expense_idr"`
	NetIDR     int64  `json:"net_idr"`
}

type DayTotals struct {
	Date       string `json:"date"`
	IncomeIDR  int64  `json:"income_idr"`
	ExpenseIDR int64  `json:"expense_idr"`
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

func monthlyTotals(ctx context.Context, q db.Querier, userID string, m finance.Month) (MonthTotals, int64, error) {
	t := MonthTotals{Month: m.String()}
	var count int64
	err := q.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_idr) FILTER (WHERE type = 'income'), 0)::bigint,
		       COALESCE(SUM(amount_idr) FILTER (WHERE type = 'expense'), 0)::bigint,
		       COUNT(*)
		FROM transactions
		WHERE user_id = $1 AND deleted_at IS NULL AND occurred_at >= $2 AND occurred_at < $3`,
		userID, m.Start(), m.End()).Scan(&t.IncomeIDR, &t.ExpenseIDR, &count)
	t.NetIDR = t.IncomeIDR - t.ExpenseIDR
	return t, count, err
}

func byCategory(ctx context.Context, q db.Querier, userID, kind string, m finance.Month) ([]CategorySlice, error) {
	rows, err := q.Query(ctx, `
		SELECT c.id, c.name, c.icon, c.color, SUM(t.amount_idr)::bigint, COUNT(*)
		FROM transactions t JOIN categories c ON c.id = t.category_id
		WHERE t.user_id = $1 AND t.deleted_at IS NULL AND t.type = $2
		  AND t.occurred_at >= $3 AND t.occurred_at < $4
		GROUP BY c.id, c.name, c.icon, c.color
		ORDER BY 5 DESC, c.name`, userID, kind, m.Start(), m.End())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CategorySlice{}
	var total int64
	for rows.Next() {
		var s CategorySlice
		if err := rows.Scan(&s.CategoryID, &s.Name, &s.Icon, &s.Color, &s.AmountIDR, &s.Count); err != nil {
			return nil, err
		}
		total += s.AmountIDR
		out = append(out, s)
	}
	for i := range out {
		if total > 0 {
			out[i].Pct = finance.Round2(float64(out[i].AmountIDR) * 100 / float64(total))
		}
	}
	return out, rows.Err()
}

func trend(ctx context.Context, q db.Querier, userID string, last finance.Month, n int) ([]MonthTotals, error) {
	first := last.Add(-(n - 1))
	rows, err := q.Query(ctx, `
		SELECT to_char(occurred_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM'),
		       COALESCE(SUM(amount_idr) FILTER (WHERE type = 'income'), 0)::bigint,
		       COALESCE(SUM(amount_idr) FILTER (WHERE type = 'expense'), 0)::bigint
		FROM transactions
		WHERE user_id = $1 AND deleted_at IS NULL AND occurred_at >= $2 AND occurred_at < $3
		GROUP BY 1`, userID, first.Start(), last.End())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := map[string]MonthTotals{}
	for rows.Next() {
		var t MonthTotals
		if err := rows.Scan(&t.Month, &t.IncomeIDR, &t.ExpenseIDR); err != nil {
			return nil, err
		}
		found[t.Month] = t
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]MonthTotals, 0, n)
	for i := 0; i < n; i++ {
		key := first.Add(i).String()
		t := found[key]
		t.Month = key
		t.NetIDR = t.IncomeIDR - t.ExpenseIDR
		out = append(out, t)
	}
	return out, nil
}

func daily(ctx context.Context, q db.Querier, userID string, m finance.Month) ([]DayTotals, error) {
	rows, err := q.Query(ctx, `
		SELECT to_char(occurred_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'),
		       COALESCE(SUM(amount_idr) FILTER (WHERE type = 'income'), 0)::bigint,
		       COALESCE(SUM(amount_idr) FILTER (WHERE type = 'expense'), 0)::bigint
		FROM transactions
		WHERE user_id = $1 AND deleted_at IS NULL AND occurred_at >= $2 AND occurred_at < $3
		GROUP BY 1`, userID, m.Start(), m.End())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := map[string]DayTotals{}
	for rows.Next() {
		var d DayTotals
		if err := rows.Scan(&d.Date, &d.IncomeIDR, &d.ExpenseIDR); err != nil {
			return nil, err
		}
		found[d.Date] = d
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]DayTotals, 0, m.Days())
	for day := m.Start(); day.Before(m.End()); day = day.AddDate(0, 0, 1) {
		key := day.Format("2006-01-02")
		d := found[key]
		d.Date = key
		out = append(out, d)
	}
	return out, nil
}

func (h *Handler) summary(w http.ResponseWriter, r *http.Request) error {
	m, err := monthParam(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	userID := auth.UserID(ctx)

	snap, err := ledger.GetSnapshot(ctx, h.DB, userID)
	if err != nil {
		return err
	}
	totals, count, err := monthlyTotals(ctx, h.DB, userID, m)
	if err != nil {
		return err
	}
	accounts, err := ledger.ListAccounts(ctx, h.DB, userID, true)
	if err != nil {
		return err
	}
	budgets, budgetTotals, err := budget.ListWithProgress(ctx, h.DB, userID, m)
	if err != nil {
		return err
	}
	goals, err := goal.List(ctx, h.DB, userID, "active")
	if err != nil {
		return err
	}
	expenses, err := byCategory(ctx, h.DB, userID, "expense", m)
	if err != nil {
		return err
	}
	recent, err := transaction.ListRecent(ctx, h.DB, userID, 6)
	if err != nil {
		return err
	}

	active := []ledger.Account{}
	negative := []string{}
	for _, a := range accounts {
		if !a.IsArchived {
			active = append(active, a)
		}
		if a.BalanceIDR < 0 {
			negative = append(negative, a.ID)
		}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"month":                  m.String(),
		"total_balance_idr":      snap.TotalBalanceIDR,
		"reserved_savings_idr":   snap.ReservedSavingsIDR,
		"available_to_spend_idr": snap.AvailableToSpendIDR,
		"monthly_income_idr":     totals.IncomeIDR,
		"monthly_expense_idr":    totals.ExpenseIDR,
		"net_cash_flow_idr":      totals.NetIDR,
		"transaction_count":      count,
		"accounts":               active,
		"has_accounts":           len(accounts) > 0,
		"budgets":                map[string]any{"items": budgets, "totals": budgetTotals},
		"goals":                  goals,
		"expense_by_category":    expenses,
		"recent_transactions":    recent,
		"warnings": map[string]any{
			"negative_accounts":  negative,
			"available_negative": snap.AvailableToSpendIDR < 0,
		},
	})
	return nil
}

func (h *Handler) monthly(w http.ResponseWriter, r *http.Request) error {
	m, err := monthParam(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	userID := auth.UserID(ctx)

	cur, count, err := monthlyTotals(ctx, h.DB, userID, m)
	if err != nil {
		return err
	}
	prev, _, err := monthlyTotals(ctx, h.DB, userID, m.Add(-1))
	if err != nil {
		return err
	}
	months, err := trend(ctx, h.DB, userID, m, 6)
	if err != nil {
		return err
	}
	expenses, err := byCategory(ctx, h.DB, userID, "expense", m)
	if err != nil {
		return err
	}
	incomes, err := byCategory(ctx, h.DB, userID, "income", m)
	if err != nil {
		return err
	}
	days, err := daily(ctx, h.DB, userID, m)
	if err != nil {
		return err
	}

	elapsed := m.Days()
	if now := time.Now(); finance.MonthOf(now) == m {
		elapsed = now.In(finance.Jakarta).Day()
	}
	var avgDaily int64
	if elapsed > 0 {
		avgDaily = cur.ExpenseIDR / int64(elapsed)
	}
	var savingsRate *float64
	if cur.IncomeIDR > 0 {
		rate := finance.Round2(float64(cur.NetIDR) * 100 / float64(cur.IncomeIDR))
		savingsRate = &rate
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"month":                 m.String(),
		"income_idr":            cur.IncomeIDR,
		"expense_idr":           cur.ExpenseIDR,
		"net_idr":               cur.NetIDR,
		"transaction_count":     count,
		"avg_daily_expense_idr": avgDaily,
		"savings_rate_pct":      savingsRate,
		"previous":              prev,
		"trend":                 months,
		"expense_by_category":   expenses,
		"income_by_category":    incomes,
		"daily":                 days,
	})
	return nil
}
