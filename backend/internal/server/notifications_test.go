package server_test

import (
	"budgetly/internal/finance"
	"sync"
	"testing"
	"time"
)

func TestBudgetNotificationsAndReminders(t *testing.T) {
	base, _ := setup(t)
	a, b, anon := newClient(t, base), newClient(t, base), newClient(t, base)
	anon.must(401, "GET", "/notifications", nil)
	register(t, a, "NotifyA")
	register(t, b, "NotifyB")
	now := time.Now()
	month := finance.MonthOf(now).String()
	category := findID(t, a.must(200, "GET", "/categories", nil)["items"], "Makan & Minum")
	account := a.must(201, "POST", "/accounts", obj{"name": "Dompet", "type": "cash", "opening_balance_idr": 1000000})["id"].(string)
	budget := a.must(201, "POST", "/budgets", obj{"category_id": category, "month": month, "limit_idr": 100000})
	eq(t, "daily allowance", num(t, budget, "daily_allowance.amount_idr"), 100000/int64(finance.MonthOf(now).Days()-now.In(finance.Jakarta).Day()+1))
	expense := func(amount int64) obj {
		return a.must(201, "POST", "/transactions", obj{"type": "expense", "account_id": account, "category_id": category, "amount_idr": amount, "occurred_at": now.Format(time.RFC3339)})
	}
	expense(79999)
	eq(t, "below threshold", num(t, a.must(200, "GET", "/notifications", nil), "total"), 0)
	expense(1)
	inbox := a.must(200, "GET", "/notifications", nil)
	eq(t, "80 percent alert", num(t, inbox, "unread_count"), 1)
	notificationID := get(inbox, "items.0.id").(string)
	if get(inbox, "items.0.kind") != "budget_warning" {
		t.Fatal(inbox)
	}
	b.must(404, "PATCH", "/notifications/"+notificationID+"/read", nil)
	a.must(204, "PATCH", "/notifications/"+notificationID+"/read", nil)
	eq(t, "read persisted", num(t, a.must(200, "GET", "/notifications", nil), "unread_count"), 0)
	expense(20000)
	inbox = a.must(200, "GET", "/notifications", nil)
	eq(t, "100 percent alert", num(t, inbox, "unread_count"), 1)
	eq(t, "two milestones", num(t, inbox, "total"), 2)
	eq(t, "no repeated alerts", num(t, a.must(200, "GET", "/notifications", nil), "total"), 2)
	a.must(204, "PATCH", "/notifications/read-all", nil)
	a.must(200, "PATCH", "/budgets/"+budget["id"].(string), obj{"limit_idr": 110000})
	eq(t, "lower severity stays read", num(t, a.must(200, "GET", "/notifications", nil), "unread_count"), 0)
	eq(t, "other user isolated", num(t, b.must(200, "GET", "/notifications", nil), "total"), 0)

	today := now.In(finance.Jakarta).Format("2006-01-02")
	a.must(422, "POST", "/bill-reminders", obj{"title": "", "due_date": today, "remind_days_before": 3})
	a.must(422, "POST", "/bill-reminders", obj{"title": "Invalid", "due_date": "2026-02-30", "remind_days_before": 3})
	reminder := a.must(201, "POST", "/bill-reminders", obj{"title": "Internet", "due_date": today, "amount_idr": 250000, "remind_days_before": 3})
	reminderID := reminder["id"].(string)
	inbox = a.must(200, "GET", "/notifications", nil)
	eq(t, "bill reminder", num(t, inbox, "unread_count"), 1)
	if get(inbox, "items.0.kind") != "bill_due" {
		t.Fatal(inbox)
	}
	b.must(404, "PATCH", "/bill-reminders/"+reminderID+"/complete", nil)
	b.must(404, "DELETE", "/bill-reminders/"+reminderID, nil)
	a.must(204, "PATCH", "/bill-reminders/"+reminderID+"/complete", nil)
	eq(t, "completion clears unread", num(t, a.must(200, "GET", "/notifications", nil), "unread_count"), 0)
	a.must(204, "DELETE", "/bill-reminders/"+reminderID, nil)
	eq(t, "deleted reminder", num(t, a.must(200, "GET", "/bill-reminders", nil), "total"), 0)
	future := now.In(finance.Jakarta).AddDate(0, 0, 10).Format("2006-01-02")
	a.must(201, "POST", "/bill-reminders", obj{"title": "Kos", "due_date": future, "remind_days_before": 3})
	eq(t, "future reminder not due", num(t, a.must(200, "GET", "/notifications", nil), "unread_count"), 0)
	boundary := now.In(finance.Jakarta).AddDate(0, 0, 3).Format("2006-01-02")
	upcoming := a.must(201, "POST", "/bill-reminders", obj{"title": "Listrik", "due_date": boundary, "remind_days_before": 3})
	eq(t, "reminder starts exactly three days before", num(t, a.must(200, "GET", "/notifications", nil), "unread_count"), 1)
	id := upcoming["id"].(string)
	b.must(404, "PATCH", "/bill-reminders/"+id, obj{"title": "Forbidden", "due_date": today, "remind_days_before": 0})
	a.must(200, "PATCH", "/bill-reminders/"+id, obj{"title": "Listrik", "due_date": future, "remind_days_before": 3})
	eq(t, "reschedule removes stale notification", num(t, a.must(200, "GET", "/notifications", nil), "unread_count"), 0)
	a.must(422, "POST", "/bill-reminders", obj{"title": "Invalid amount", "due_date": today, "amount_idr": -1})
	a.must(422, "POST", "/bill-reminders", obj{"title": "Invalid advance", "due_date": today, "remind_days_before": 31})
	anon.must(401, "GET", "/bill-reminders", nil)
}

func TestConcurrentBudgetAlerts(t *testing.T) {
	base, _ := setup(t)
	a := newClient(t, base)
	register(t, a, "ConcurrentAlerts")
	now := time.Now()
	month := finance.MonthOf(now).String()
	category := findID(t, a.must(200, "GET", "/categories", nil)["items"], "Makan & Minum")
	account := a.must(201, "POST", "/accounts", obj{"name": "Dompet", "type": "cash"})["id"].(string)
	budget := a.must(201, "POST", "/budgets", obj{"category_id": category, "month": month, "limit_idr": 100000})
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.must(201, "POST", "/transactions", obj{"type": "expense", "account_id": account, "category_id": category, "amount_idr": 10000, "occurred_at": now.Format(time.RFC3339)})
		}()
	}
	wg.Wait()
	inbox := a.must(200, "GET", "/notifications", nil)
	eq(t, "concurrent writes deduplicated", num(t, inbox, "total"), 2)
	eq(t, "only most urgent unread", num(t, inbox, "unread_count"), 1)
	eq(t, "unread filtering", num(t, a.must(200, "GET", "/notifications?unread_only=true", nil), "total"), 1)
	eq(t, "pagination total", num(t, a.must(200, "GET", "/notifications?page=2&page_size=1", nil), "total"), 2)
	a.must(204, "DELETE", "/budgets/"+budget["id"].(string), nil)
	a.must(201, "POST", "/budgets", obj{"category_id": category, "month": month, "limit_idr": 100000})
	eq(t, "recreated category budget not duplicated", num(t, a.must(200, "GET", "/notifications", nil), "total"), 2)
}
