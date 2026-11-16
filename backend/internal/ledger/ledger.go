package ledger

import (
	"context"
	"time"

	"budgetly/internal/platform/db"
)

type Snapshot struct {
	TotalBalanceIDR     int64 `json:"total_balance_idr"`
	ReservedSavingsIDR  int64 `json:"reserved_savings_idr"`
	AvailableToSpendIDR int64 `json:"available_to_spend_idr"`
}

const snapshotSQL = `
SELECT
  (SELECT COALESCE(SUM(opening_balance_idr), 0) FROM accounts WHERE user_id = $1)::bigint
  + (SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount_idr ELSE -amount_idr END), 0)
       FROM transactions WHERE user_id = $1 AND deleted_at IS NULL)::bigint,
  (SELECT COALESCE(SUM(CASE WHEN type = 'allocate' THEN amount_idr ELSE -amount_idr END), 0)
     FROM goal_allocations WHERE user_id = $1)::bigint`

func GetSnapshot(ctx context.Context, q db.Querier, userID string) (Snapshot, error) {
	var s Snapshot
	if err := q.QueryRow(ctx, snapshotSQL, userID).Scan(&s.TotalBalanceIDR, &s.ReservedSavingsIDR); err != nil {
		return s, err
	}
	s.AvailableToSpendIDR = s.TotalBalanceIDR - s.ReservedSavingsIDR
	return s, nil
}

type Account struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	Type              string    `json:"type"`
	OpeningBalanceIDR int64     `json:"opening_balance_idr"`
	OpeningDate       string    `json:"opening_date"`
	IsArchived        bool      `json:"is_archived"`
	BalanceIDR        int64     `json:"balance_idr"`
	HasActivity       bool      `json:"has_activity"`
	CreatedAt         time.Time `json:"created_at"`
}

const accountsSQL = `
SELECT a.id, a.name, a.type, a.opening_balance_idr, a.opening_date, a.is_archived, a.created_at,
       (a.opening_balance_idr + COALESCE(t.net, 0) + COALESCE(tin.amt, 0) - COALESCE(tout.amt, 0))::bigint,
       (t.cnt + tin.cnt + tout.cnt) > 0
FROM accounts a
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN type = 'income' THEN amount_idr ELSE -amount_idr END) AS net, COUNT(*) AS cnt
  FROM transactions WHERE account_id = a.id AND deleted_at IS NULL
) t ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount_idr) AS amt, COUNT(*) AS cnt FROM transfers WHERE to_account_id = a.id AND deleted_at IS NULL
) tin ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount_idr) AS amt, COUNT(*) AS cnt FROM transfers WHERE from_account_id = a.id AND deleted_at IS NULL
) tout ON true
WHERE a.user_id = $1`

func ListAccounts(ctx context.Context, q db.Querier, userID string, includeArchived bool) ([]Account, error) {
	sql := accountsSQL
	if !includeArchived {
		sql += ` AND NOT a.is_archived`
	}
	sql += ` ORDER BY a.is_archived, a.created_at`
	return queryAccounts(ctx, q, sql, userID)
}

func GetAccount(ctx context.Context, q db.Querier, userID, accountID string) (Account, error) {
	list, err := queryAccounts(ctx, q, accountsSQL+` AND a.id = $2`, userID, accountID)
	if err != nil {
		return Account{}, err
	}
	if len(list) == 0 {
		return Account{}, errNotFound
	}
	return list[0], nil
}

type notFound struct{}

func (notFound) Error() string { return "account not found" }

var errNotFound = notFound{}

func IsNotFound(err error) bool { _, ok := err.(notFound); return ok }

func queryAccounts(ctx context.Context, q db.Querier, sql string, args ...any) ([]Account, error) {
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Account{}
	for rows.Next() {
		var a Account
		var opening time.Time
		if err := rows.Scan(&a.ID, &a.Name, &a.Type, &a.OpeningBalanceIDR, &opening, &a.IsArchived,
			&a.CreatedAt, &a.BalanceIDR, &a.HasActivity); err != nil {
			return nil, err
		}
		a.OpeningDate = opening.Format("2006-01-02")
		out = append(out, a)
	}
	return out, rows.Err()
}

type Warnings struct {
	NegativeAccounts    []string `json:"negative_accounts"`
	AvailableNegative   bool     `json:"available_negative"`
	TotalNegative       bool     `json:"total_negative"`
	AvailableToSpendIDR int64    `json:"available_to_spend_idr"`
}

func ComputeWarnings(ctx context.Context, q db.Querier, userID string) (Warnings, error) {
	w := Warnings{NegativeAccounts: []string{}}
	snap, err := GetSnapshot(ctx, q, userID)
	if err != nil {
		return w, err
	}
	accounts, err := ListAccounts(ctx, q, userID, true)
	if err != nil {
		return w, err
	}
	for _, a := range accounts {
		if a.BalanceIDR < 0 {
			w.NegativeAccounts = append(w.NegativeAccounts, a.ID)
		}
	}
	w.AvailableNegative = snap.AvailableToSpendIDR < 0
	w.TotalNegative = snap.TotalBalanceIDR < 0
	w.AvailableToSpendIDR = snap.AvailableToSpendIDR
	return w, nil
}
