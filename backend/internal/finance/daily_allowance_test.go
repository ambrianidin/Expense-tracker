package finance

import (
	"testing"
	"time"
)

func TestDailyAllowance(t *testing.T) {
	cases := []struct {
		name, month, now  string
		remaining, amount int64
		days              int
		period            string
	}{
		{"includes today", "2026-11", "2026-11-21T12:00:00+07:00", 300000, 30000, 10, "current"},
		{"rounds down", "2026-11", "2026-11-28T12:00:00+07:00", 100, 33, 3, "current"},
		{"last day", "2026-11", "2026-11-30T23:59:00+07:00", 12345, 12345, 1, "current"},
		{"Jakarta midnight", "2026-12", "2026-11-30T17:00:00Z", 310000, 10000, 31, "current"},
		{"leap month", "2028-02", "2028-02-01T00:00:00+07:00", 290000, 10000, 29, "current"},
		{"future", "2026-12", "2026-11-16T10:00:00+07:00", 310000, 10000, 31, "future"},
		{"past", "2026-10", "2026-11-01T00:00:00+07:00", 300000, 0, 0, "past"},
		{"overspent", "2026-11", "2026-11-21T12:00:00+07:00", -20000, 0, 10, "current"},
		{"empty", "2026-11", "2026-11-21T12:00:00+07:00", 0, 0, 10, "current"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m, _ := ParseMonth(c.month)
			now, _ := time.Parse(time.RFC3339, c.now)
			got := ComputeDailyAllowance(c.remaining, m, now)
			if got.AmountIDR != c.amount || got.DaysRemaining != c.days || got.Period != c.period {
				t.Fatalf("got %+v; want amount=%d days=%d period=%s", got, c.amount, c.days, c.period)
			}
			if got.AsOfDate != now.In(Jakarta).Format("2006-01-02") {
				t.Fatalf("incorrect date: %s", got.AsOfDate)
			}
		})
	}
}
