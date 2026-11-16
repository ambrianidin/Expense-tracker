package finance

import (
	"errors"
	"testing"
	"time"
)

func TestComputeBudgetOverspent(t *testing.T) {
	p := ComputeBudget(1_500_000, 2_000_000)
	if p.RemainingIDR != -500_000 {
		t.Fatalf("remaining = %d, want -500000", p.RemainingIDR)
	}
	if p.UsagePct != 133.33 {
		t.Fatalf("usage = %v, want 133.33", p.UsagePct)
	}
	if p.Status != BudgetOver {
		t.Fatalf("status = %s, want over", p.Status)
	}
}

func TestComputeBudgetThresholds(t *testing.T) {
	cases := []struct {
		limit, spent int64
		want         BudgetStatus
	}{
		{1_000_000, 0, BudgetSafe},
		{1_000_000, 799_999, BudgetSafe},
		{1_000_000, 800_000, BudgetWarning},
		{1_000_000, 999_999, BudgetWarning},
		{1_000_000, 1_000_000, BudgetOver},
		{3, 2, BudgetSafe},
		{5, 4, BudgetWarning},
	}
	for _, c := range cases {
		if got := ComputeBudget(c.limit, c.spent).Status; got != c.want {
			t.Errorf("ComputeBudget(%d,%d) = %s, want %s", c.limit, c.spent, got, c.want)
		}
	}
}

func TestGoalProgressPct(t *testing.T) {
	if got := GoalProgressPct(500_000, 10_000_000); got != 5 {
		t.Fatalf("got %v, want 5", got)
	}
	if got := GoalProgressPct(10_000_000, 10_000_000); got != 100 {
		t.Fatalf("got %v, want 100", got)
	}
	if got := GoalProgressPct(1, 3); got != 33.33 {
		t.Fatalf("got %v, want 33.33", got)
	}
}

func TestCheckAllocation(t *testing.T) {

	if err := CheckAllocation(Allocate, 500_000, 0, 10_000_000, 3_000_000); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	available := int64(2_500_000)
	if err := CheckAllocation(Allocate, 2_000_000, 0, 10_000_000, available); err != nil {
		t.Fatalf("first allocation: %v", err)
	}
	available -= 2_000_000
	if err := CheckAllocation(Allocate, 2_000_000, 2_000_000, 10_000_000, available); !errors.Is(err, ErrExceedsAvailable) {
		t.Fatalf("second allocation err = %v, want ErrExceedsAvailable", err)
	}

	if err := CheckAllocation(Allocate, 1, 0, 10, -100); !errors.Is(err, ErrExceedsAvailable) {
		t.Fatalf("negative available err = %v", err)
	}

	if err := CheckAllocation(Allocate, 600, 500, 1_000, 10_000); !errors.Is(err, ErrExceedsTarget) {
		t.Fatalf("target err = %v", err)
	}

	if err := CheckAllocation(Release, 600_000, 500_000, 10_000_000, 0); !errors.Is(err, ErrExceedsSaved) {
		t.Fatalf("release err = %v, want ErrExceedsSaved", err)
	}
	if err := CheckAllocation(Release, 500_000, 500_000, 10_000_000, 0); err != nil {
		t.Fatalf("full release: %v", err)
	}
}

func TestMonthBoundariesJakarta(t *testing.T) {
	lastMinute := time.Date(2025, 11, 30, 23, 59, 0, 0, Jakarta)
	firstMinute := time.Date(2025, 12, 1, 0, 0, 0, 0, Jakarta)
	if got := MonthOf(lastMinute).String(); got != "2025-11" {
		t.Fatalf("23:59 WIB -> %s, want 2025-11", got)
	}
	if got := MonthOf(firstMinute).String(); got != "2025-12" {
		t.Fatalf("00:00 WIB -> %s, want 2025-12", got)
	}

	if got := MonthOf(lastMinute.UTC()).String(); got != "2025-11" {
		t.Fatalf("UTC 16:59 -> %s, want 2025-11", got)
	}
	nov, _ := ParseMonth("2025-11")
	if !nov.End().Equal(firstMinute) {
		t.Fatalf("Nov end = %v, want %v", nov.End(), firstMinute)
	}
	if !nov.End().UTC().Equal(time.Date(2025, 11, 30, 17, 0, 0, 0, time.UTC)) {
		t.Fatalf("Nov end in UTC = %v", nov.End().UTC())
	}
	if lastMinute.Before(nov.Start()) || !lastMinute.Before(nov.End()) {
		t.Fatal("23:59 WIB should be inside [start, end) of November")
	}
}

func TestParseMonth(t *testing.T) {
	for _, bad := range []string{"", "2026-13", "2026/11", "26-11", "1999-12"} {
		if _, err := ParseMonth(bad); err == nil {
			t.Errorf("ParseMonth(%q) should fail", bad)
		}
	}
	m, err := ParseMonth("2026-02")
	if err != nil || m.Days() != 28 || m.Add(-2).String() != "2025-12" {
		t.Fatalf("ParseMonth(2026-02) = %v %v", m, err)
	}
}

func TestValidOccurredAt(t *testing.T) {
	now := time.Date(2026, 11, 10, 9, 0, 0, 0, Jakarta)
	if !ValidOccurredAt(time.Date(2026, 11, 10, 23, 30, 0, 0, Jakarta), now) {
		t.Fatal("later today should be allowed")
	}
	if ValidOccurredAt(time.Date(2026, 11, 11, 0, 0, 0, 0, Jakarta), now) {
		t.Fatal("tomorrow should be rejected")
	}
	if ValidOccurredAt(time.Date(1999, 12, 31, 0, 0, 0, 0, Jakarta), now) {
		t.Fatal("before 2000 should be rejected")
	}
}

func TestValidAmount(t *testing.T) {
	if ValidAmount(0) || ValidAmount(-1) || ValidAmount(MaxAmount+1) {
		t.Fatal("invalid amounts accepted")
	}
	if !ValidAmount(1) || !ValidAmount(MaxAmount) {
		t.Fatal("valid amounts rejected")
	}
}
