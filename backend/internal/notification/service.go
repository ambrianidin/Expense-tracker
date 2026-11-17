package notification

import (
	"context"
	"fmt"
	"time"

	"budgetly/internal/finance"
	"budgetly/internal/platform/db"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WithRefresh serializes budget-changing writes per user and records alerts in
// the same transaction. A nil write catches up existing budgets and due bills.
func WithRefresh(ctx context.Context, pool *pgxpool.Pool, userID string, write func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if err := db.LockUser(ctx, tx, userID); err != nil {
			return err
		}
		if write != nil {
			if err := write(tx); err != nil {
				return err
			}
		}
		now := time.Now()
		if err := refreshBudgets(ctx, tx, userID, now); err != nil {
			return err
		}
		return refreshBills(ctx, tx, userID, now)
	})
}

type budgetAlert struct {
	categoryID, name string
	limit, spent     int64
}

func refreshBudgets(ctx context.Context, q db.Querier, userID string, now time.Time) error {
	m := finance.MonthOf(now)
	rows, err := q.Query(ctx, `SELECT c.id, c.name, b.limit_idr, COALESCE(s.spent,0)::bigint
 FROM budgets b JOIN categories c ON c.id=b.category_id AND c.user_id=b.user_id
 LEFT JOIN LATERAL (SELECT SUM(t.amount_idr) spent FROM transactions t
 WHERE t.user_id=b.user_id AND t.category_id=b.category_id AND t.type='expense'
 AND t.deleted_at IS NULL AND t.occurred_at >= $3 AND t.occurred_at < $4) s ON true
 WHERE b.user_id=$1 AND b.month_start=$2 AND NOT c.is_archived`, userID, m.Date(), m.Start(), m.End())
	if err != nil {
		return err
	}
	alerts := []budgetAlert{}
	for rows.Next() {
		var a budgetAlert
		if err := rows.Scan(&a.categoryID, &a.name, &a.limit, &a.spent); err != nil {
			rows.Close()
			return err
		}
		alerts = append(alerts, a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, a := range alerts {
		progress := finance.ComputeBudget(a.limit, a.spent)
		if progress.Status == finance.BudgetSafe {
			continue
		}
		prefix := "budget:" + a.categoryID + ":" + m.String() + ":"
		kind, key, title := "budget_warning", prefix+"80", "Budget "+a.name+" hampir habis"
		if progress.Status == finance.BudgetOver {
			kind, key, title = "budget_exceeded", prefix+"100", "Budget "+a.name+" sudah habis"
		}
		body := fmt.Sprintf("%s · Terpakai %s dari %s. Sisa %s.", m.String(), finance.FormatIDR(a.spent), finance.FormatIDR(a.limit), finance.FormatIDR(max(0, progress.RemainingIDR)))
		if progress.RemainingIDR < 0 {
			body = fmt.Sprintf("%s · Terpakai %s dari %s, melebihi budget %s.", m.String(), finance.FormatIDR(a.spent), finance.FormatIDR(a.limit), finance.FormatIDR(-progress.RemainingIDR))
		}
		// A 100% alert supersedes an unread 80% alert, and suppresses later downgrades.
		if kind == "budget_exceeded" {
			if _, err := q.Exec(ctx, `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND source_key=$2`, userID, prefix+"80"); err != nil {
				return err
			}
		}
		_, err := q.Exec(ctx, `INSERT INTO notifications (user_id,source_key,kind,title,body,href)
   SELECT $1,$2,$3,$4,$5,$6 WHERE $3='budget_exceeded' OR NOT EXISTS
   (SELECT 1 FROM notifications WHERE user_id=$1 AND source_key=$7)
   ON CONFLICT (user_id,source_key) DO NOTHING`, userID, key, kind, title, body, "/budgets?month="+m.String(), prefix+"100")
		if err != nil {
			return err
		}
	}
	return nil
}

func refreshBills(ctx context.Context, q db.Querier, userID string, now time.Time) error {
	rows, err := q.Query(ctx, `SELECT id,title,amount_idr,due_date FROM bill_reminders
 WHERE user_id=$1 AND completed_at IS NULL AND due_date-remind_days_before <= $2::date`, userID, finance.Today(now))
	if err != nil {
		return err
	}
	type dueBill struct {
		id, title string
		amount    *int64
		due       time.Time
	}
	bills := []dueBill{}
	for rows.Next() {
		var b dueBill
		if err := rows.Scan(&b.id, &b.title, &b.amount, &b.due); err != nil {
			rows.Close()
			return err
		}
		bills = append(bills, b)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, b := range bills {
		body := "Jatuh tempo " + b.due.Format("02-01-2006") + " (WIB)."
		if b.amount != nil {
			body += " Nominal " + finance.FormatIDR(*b.amount) + "."
		}
		body += " Tandai selesai setelah kamu membayarnya."
		_, err := q.Exec(ctx, `INSERT INTO notifications (user_id,source_key,kind,title,body,href)
  VALUES ($1,$2,'bill_due',$3,$4,'/notifications') ON CONFLICT (user_id,source_key) DO NOTHING`, userID, "bill:"+b.id, "Tagihan "+b.title, body)
		if err != nil {
			return err
		}
	}
	return nil
}
