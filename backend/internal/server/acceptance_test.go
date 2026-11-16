package server_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"budgetly/internal/config"
	"budgetly/internal/finance"
	"budgetly/internal/platform/db"
	"budgetly/internal/server"
	"budgetly/migrations"
)

type obj = map[string]any

type client struct {
	t    *testing.T
	base string
	http *http.Client
	csrf string
}

func newClient(t *testing.T, base string) *client {
	jar, _ := cookiejar.New(nil)
	c := &client{t: t, base: base, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}}
	_, body := c.do("GET", "/auth/csrf", nil)
	c.csrf = body["csrf_token"].(string)
	return c
}

func (c *client) do(method, path string, payload any) (int, obj) {
	c.t.Helper()
	var rdr io.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		rdr = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+"/api/v1"+path, rdr)
	req.Header.Set("Content-Type", "application/json")
	if c.csrf != "" {
		req.Header.Set("X-CSRF-Token", c.csrf)
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := obj{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return res.StatusCode, out
}

func (c *client) must(want int, method, path string, payload any) obj {
	c.t.Helper()
	got, body := c.do(method, path, payload)
	if got != want {
		c.t.Fatalf("%s %s: status %d, want %d; body %v", method, path, got, want, body)
	}
	return body
}

func get(v any, path string) any {
	for _, key := range strings.Split(path, ".") {
		switch node := v.(type) {
		case obj:
			v = node[key]
		case []any:
			var i int
			fmt.Sscanf(key, "%d", &i)
			if i >= len(node) {
				return nil
			}
			v = node[i]
		default:
			return nil
		}
	}
	return v
}

func num(t *testing.T, v any, path string) int64 {
	t.Helper()
	f, ok := get(v, path).(float64)
	if !ok {
		t.Fatalf("path %q is not a number in %v", path, v)
	}
	return int64(f)
}

func eq(t *testing.T, label string, got, want int64) {
	t.Helper()
	if got != want {
		t.Fatalf("%s = %d, want %d", label, got, want)
	}
}

func findID(t *testing.T, items any, name string) string {
	t.Helper()
	for _, it := range items.([]any) {
		if it.(obj)["name"] == name {
			return it.(obj)["id"].(string)
		}
	}
	t.Fatalf("item %q not found", name)
	return ""
}

func randHex() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func setup(t *testing.T) (string, *pgxpool.Pool) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping database acceptance tests")
	}
	schema := os.Getenv("TEST_DB_SCHEMA")
	if schema == "" {
		schema = "budgetly"
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url, 10, schema)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Migrate(ctx, pool, migrations.FS, schema); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{AllowedOrigins: []string{"http://localhost:3000"}, AuthRateLimit: 1000}
	srv := httptest.NewServer(server.New(pool, cfg))
	t.Cleanup(func() {
		srv.Close()
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE email LIKE 'acceptance-%@budgetly.test'`)
		pool.Close()
	})
	return srv.URL, pool
}

func register(t *testing.T, c *client, name string) {
	c.must(201, "POST", "/auth/register", obj{
		"name": name, "email": fmt.Sprintf("acceptance-%s-%s@budgetly.test", strings.ToLower(name), randHex()),
		"password": "rahasia-123",
	})
}

func TestAcceptance(t *testing.T) {
	base, _ := setup(t)
	now := time.Now().UTC().Format(time.RFC3339)
	month := finance.MonthOf(time.Now()).String()

	anon := newClient(t, base)
	anon.must(401, "GET", "/accounts", nil)
	noCSRF := newClient(t, base)
	noCSRF.csrf = ""
	noCSRF.must(403, "POST", "/auth/login", obj{"email": "x@y.z", "password": "whatever1"})

	a := newClient(t, base)
	register(t, a, "Alya")

	cats := a.must(200, "GET", "/categories", nil)["items"]
	salary := findID(t, cats, "Gaji")
	food := findID(t, cats, "Makan & Minum")

	bank := a.must(201, "POST", "/accounts", obj{"name": "Bank A", "type": "bank", "opening_balance_idr": 0})["id"].(string)
	wallet := a.must(201, "POST", "/accounts", obj{"name": "E-wallet B", "type": "ewallet", "opening_balance_idr": 0})["id"].(string)

	summary := func(c *client) obj { return c.must(200, "GET", "/dashboard/summary?month="+month, nil) }
	account := func(c *client, id string) obj { return c.must(200, "GET", "/accounts/"+id, nil) }

	var expenseID, laptopID string

	t.Run("BR-03 type must match category", func(t *testing.T) {
		_, body := a.do("POST", "/transactions", obj{"type": "expense", "account_id": bank, "category_id": salary, "amount_idr": 1000, "occurred_at": now})
		if get(body, "error.fields.category_id") == nil {
			t.Fatalf("expected category_id field error, got %v", body)
		}
		_, body = a.do("POST", "/transactions", obj{"type": "expense", "account_id": bank, "category_id": food, "amount_idr": 0, "occurred_at": now})
		if get(body, "error.fields.amount_idr") == nil {
			t.Fatalf("expected amount error, got %v", body)
		}
	})

	t.Run("TC-01 income and expense", func(t *testing.T) {
		a.must(201, "POST", "/transactions", obj{"type": "income", "account_id": bank, "category_id": salary, "amount_idr": 5_000_000, "occurred_at": now})
		res := a.must(201, "POST", "/transactions", obj{"type": "expense", "account_id": bank, "category_id": food, "amount_idr": 2_000_000, "occurred_at": now, "note": "Makan sebulan"})
		expenseID = get(res, "transaction.id").(string)
		s := summary(a)
		eq(t, "total", num(t, s, "total_balance_idr"), 3_000_000)
		eq(t, "net", num(t, s, "net_cash_flow_idr"), 3_000_000)
	})

	t.Run("TC-02 allocation keeps balance", func(t *testing.T) {
		laptopID = a.must(201, "POST", "/savings-goals", obj{"title": "Laptop", "target_amount_idr": 10_000_000})["id"].(string)
		a.must(201, "POST", "/savings-goals/"+laptopID+"/allocations", obj{"type": "allocate", "amount_idr": 500_000})
		s := summary(a)
		eq(t, "total", num(t, s, "total_balance_idr"), 3_000_000)
		eq(t, "reserved", num(t, s, "reserved_savings_idr"), 500_000)
		eq(t, "available", num(t, s, "available_to_spend_idr"), 2_500_000)
		eq(t, "bank balance", num(t, account(a, bank), "balance_idr"), 3_000_000)
		eq(t, "expense unchanged", num(t, s, "monthly_expense_idr"), 2_000_000)
	})

	t.Run("TC-03 transfer is not income or expense", func(t *testing.T) {
		a.must(201, "POST", "/transfers", obj{"from_account_id": bank, "to_account_id": wallet, "amount_idr": 1_000_000, "occurred_at": now})
		s := summary(a)
		eq(t, "total", num(t, s, "total_balance_idr"), 3_000_000)
		eq(t, "income", num(t, s, "monthly_income_idr"), 5_000_000)
		eq(t, "expense", num(t, s, "monthly_expense_idr"), 2_000_000)
		eq(t, "bank", num(t, account(a, bank), "balance_idr"), 2_000_000)
		eq(t, "wallet", num(t, account(a, wallet), "balance_idr"), 1_000_000)
		_, body := a.do("POST", "/transfers", obj{"from_account_id": bank, "to_account_id": bank, "amount_idr": 1, "occurred_at": now})
		if get(body, "error.fields.to_account_id") == nil {
			t.Fatalf("same-account transfer should fail, got %v", body)
		}
	})

	var budgetID string
	t.Run("TC-04 overspent budget", func(t *testing.T) {
		b := a.must(201, "POST", "/budgets", obj{"category_id": food, "month": month, "limit_idr": 1_500_000})
		budgetID = b["id"].(string)
		eq(t, "spent", num(t, b, "spent_idr"), 2_000_000)
		eq(t, "remaining", num(t, b, "remaining_idr"), -500_000)
		if b["usage_pct"].(float64) != 133.33 || b["status"] != "over" {
			t.Fatalf("usage/status = %v/%v", b["usage_pct"], b["status"])
		}
		_, body := a.do("POST", "/budgets", obj{"category_id": salary, "month": month, "limit_idr": 1})
		if get(body, "error.fields.category_id") == nil {
			t.Fatalf("income category budget should fail, got %v", body)
		}
	})

	t.Run("TC-11 duplicate budget conflicts", func(t *testing.T) {
		body := a.must(409, "POST", "/budgets", obj{"category_id": food, "month": month, "limit_idr": 999})
		if get(body, "error.code") != "budget_exists" {
			t.Fatalf("code = %v", get(body, "error.code"))
		}
	})

	t.Run("TC-05 concurrent allocations never over-allocate", func(t *testing.T) {
		var wg sync.WaitGroup
		statuses := make([]int, 2)
		for i := range statuses {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				statuses[i], _ = a.do("POST", "/savings-goals/"+laptopID+"/allocations", obj{"type": "allocate", "amount_idr": 2_000_000})
			}(i)
		}
		wg.Wait()
		ok, rejected := 0, 0
		for _, s := range statuses {
			switch s {
			case 201:
				ok++
			case 422:
				rejected++
			}
		}
		if ok != 1 || rejected != 1 {
			t.Fatalf("statuses = %v, want exactly one 201 and one 422", statuses)
		}
		s := summary(a)
		eq(t, "reserved", num(t, s, "reserved_savings_idr"), 2_500_000)
		eq(t, "available", num(t, s, "available_to_spend_idr"), 500_000)
	})

	t.Run("TC-06 release cannot exceed saved", func(t *testing.T) {
		trip := a.must(201, "POST", "/savings-goals", obj{"title": "Liburan", "target_amount_idr": 1_000_000})["id"].(string)
		over := a.must(422, "POST", "/savings-goals/"+trip+"/allocations", obj{"type": "allocate", "amount_idr": 600_000})
		if get(over, "error.code") != "insufficient_available" {
			t.Fatalf("code = %v", get(over, "error.code"))
		}
		a.must(201, "POST", "/savings-goals/"+trip+"/allocations", obj{"type": "allocate", "amount_idr": 500_000})
		body := a.must(422, "POST", "/savings-goals/"+trip+"/allocations", obj{"type": "release", "amount_idr": 600_000})
		if get(body, "error.code") != "exceeds_saved" {
			t.Fatalf("code = %v", get(body, "error.code"))
		}
		a.must(201, "POST", "/savings-goals/"+trip+"/allocations", obj{"type": "release", "amount_idr": 400_000})

		conflict := a.must(409, "PATCH", "/savings-goals/"+trip, obj{"status": "archived"})
		if get(conflict, "error.code") != "goal_has_funds" {
			t.Fatalf("code = %v", get(conflict, "error.code"))
		}
		archived := a.must(200, "PATCH", "/savings-goals/"+trip, obj{"status": "archived", "release_remaining": true})
		if archived["status"] != "archived" || num(t, archived, "saved_idr") != 0 {
			t.Fatalf("archive result = %v", archived)
		}
		eq(t, "reserved", num(t, summary(a), "reserved_savings_idr"), 2_500_000)

		a.must(422, "PATCH", "/savings-goals/"+laptopID, obj{"target_amount_idr": 1_000_000})
	})

	b := newClient(t, base)
	register(t, b, "Bima")

	t.Run("TC-07 cross-user access is rejected", func(t *testing.T) {
		b.must(404, "GET", "/accounts/"+bank, nil)
		b.must(404, "GET", "/transactions/"+expenseID, nil)
		b.must(404, "PATCH", "/transactions/"+expenseID, obj{"amount_idr": 1})
		b.must(404, "DELETE", "/transactions/"+expenseID, nil)
		b.must(404, "GET", "/savings-goals/"+laptopID, nil)
		b.must(404, "POST", "/savings-goals/"+laptopID+"/allocations", obj{"type": "release", "amount_idr": 1})
		b.must(404, "PATCH", "/budgets/"+budgetID, obj{"limit_idr": 1})
		bCats := b.must(200, "GET", "/categories", nil)["items"]
		_, body := b.do("POST", "/transactions", obj{"type": "expense", "account_id": bank, "category_id": findID(t, bCats, "Makan & Minum"), "amount_idr": 1, "occurred_at": now})
		if get(body, "error.fields.account_id") == nil {
			t.Fatalf("foreign account should be rejected, got %v", body)
		}
		_, body = b.do("POST", "/budgets", obj{"category_id": food, "month": month, "limit_idr": 1})
		if get(body, "error.fields.category_id") == nil {
			t.Fatalf("foreign category should be rejected, got %v", body)
		}
		list := b.must(200, "GET", "/transactions", nil)
		eq(t, "B sees no transactions", num(t, list, "total"), 0)
		if len(b.must(200, "GET", "/accounts", nil)["items"].([]any)) != 0 {
			t.Fatal("B should see no accounts")
		}
	})

	t.Run("TC-08 edit and delete recalculate", func(t *testing.T) {
		a.must(200, "PATCH", "/transactions/"+expenseID, obj{"amount_idr": 1_000_000})
		s := summary(a)
		eq(t, "total after edit", num(t, s, "total_balance_idr"), 4_000_000)
		eq(t, "expense after edit", num(t, s, "monthly_expense_idr"), 1_000_000)
		eq(t, "budget spent after edit", num(t, s, "budgets.items.0.spent_idr"), 1_000_000)
		a.must(204, "DELETE", "/transactions/"+expenseID, nil)
		a.must(404, "GET", "/transactions/"+expenseID, nil)
		s = summary(a)
		eq(t, "total after delete", num(t, s, "total_balance_idr"), 5_000_000)
		eq(t, "budget spent after delete", num(t, s, "budgets.items.0.spent_idr"), 0)
		r := a.must(200, "GET", "/reports/monthly?month="+month, nil)
		eq(t, "report expense", num(t, r, "expense_idr"), 0)
	})

	t.Run("TC-09 expense may push available negative", func(t *testing.T) {
		res := a.must(201, "POST", "/transactions", obj{"type": "expense", "account_id": wallet, "category_id": food, "amount_idr": 6_000_000, "occurred_at": now})
		if get(res, "warnings.available_negative") != true {
			t.Fatalf("warning missing: %v", res["warnings"])
		}
		s := summary(a)
		eq(t, "total", num(t, s, "total_balance_idr"), -1_000_000)
		eq(t, "reserved untouched", num(t, s, "reserved_savings_idr"), 2_500_000)
		eq(t, "available", num(t, s, "available_to_spend_idr"), -3_500_000)
		if len(get(s, "warnings.negative_accounts").([]any)) != 1 {
			t.Fatalf("negative accounts = %v", get(s, "warnings.negative_accounts"))
		}
		a.must(422, "POST", "/savings-goals/"+laptopID+"/allocations", obj{"type": "allocate", "amount_idr": 1})
	})

	t.Run("BR-16 opening balance change needs confirmation", func(t *testing.T) {
		body := a.must(409, "PATCH", "/accounts/"+bank, obj{"opening_balance_idr": 100_000})
		if get(body, "error.code") != "confirmation_required" {
			t.Fatalf("code = %v", get(body, "error.code"))
		}
		acc := a.must(200, "PATCH", "/accounts/"+bank, obj{"opening_balance_idr": 100_000, "confirm_recalculate": true})
		eq(t, "bank after opening change", num(t, acc, "balance_idr"), 4_100_000)
	})

	t.Run("TC-12 archived account and category keep history", func(t *testing.T) {
		before := num(t, summary(a), "total_balance_idr")
		a.must(200, "PATCH", "/accounts/"+bank, obj{"is_archived": true})
		if len(a.must(200, "GET", "/accounts", nil)["items"].([]any)) != 1 {
			t.Fatal("archived account should be hidden from default list")
		}
		if len(a.must(200, "GET", "/accounts?include_archived=true", nil)["items"].([]any)) != 2 {
			t.Fatal("archived account should be listed with include_archived")
		}
		eq(t, "total unchanged", num(t, summary(a), "total_balance_idr"), before)
		_, body := a.do("POST", "/transactions", obj{"type": "income", "account_id": bank, "category_id": salary, "amount_idr": 1, "occurred_at": now})
		if get(body, "error.fields.account_id") == nil {
			t.Fatalf("archived account should reject new entries, got %v", body)
		}
		a.must(200, "PATCH", "/categories/"+food, obj{"is_archived": true})
		for _, c := range a.must(200, "GET", "/categories?type=expense", nil)["items"].([]any) {
			if c.(obj)["id"] == food {
				t.Fatal("archived category should be hidden")
			}
		}
		r := a.must(200, "GET", "/reports/monthly?month="+month, nil)
		if get(r, "expense_by_category.0.category_id") != food {
			t.Fatalf("archived category history missing from report: %v", r["expense_by_category"])
		}
	})

	t.Run("TC-10 Jakarta month boundaries", func(t *testing.T) {
		bCats := b.must(200, "GET", "/categories", nil)["items"]
		bSalary := findID(t, bCats, "Gaji")
		cash := b.must(201, "POST", "/accounts", obj{"name": "Dompet", "type": "cash", "opening_balance_idr": 0, "opening_date": "2025-01-01"})["id"].(string)
		b.must(201, "POST", "/transactions", obj{"type": "income", "account_id": cash, "category_id": bSalary, "amount_idr": 111, "occurred_at": "2025-11-30T23:59:00+07:00"})
		b.must(201, "POST", "/transactions", obj{"type": "income", "account_id": cash, "category_id": bSalary, "amount_idr": 222, "occurred_at": "2025-12-01T00:00:00+07:00"})
		eq(t, "November", num(t, b.must(200, "GET", "/reports/monthly?month=2025-11", nil), "income_idr"), 111)
		eq(t, "December", num(t, b.must(200, "GET", "/reports/monthly?month=2025-12", nil), "income_idr"), 222)
		list := b.must(200, "GET", "/transactions?month=2025-11", nil)
		eq(t, "November list", num(t, list, "total"), 1)
	})
}
