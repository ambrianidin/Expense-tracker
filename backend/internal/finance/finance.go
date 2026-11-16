package finance

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"
)

var Jakarta = mustLoad("Asia/Jakarta")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.FixedZone("WIB", 7*60*60)
	}
	return loc
}

const MaxAmount int64 = 1_000_000_000_000

func ValidAmount(a int64) bool { return a > 0 && a <= MaxAmount }

type Month struct {
	Year  int
	Month time.Month
}

func ParseMonth(s string) (Month, error) {
	t, err := time.ParseInLocation("2006-01", s, Jakarta)
	if err != nil || t.Year() < 2000 || t.Year() > 2100 {
		return Month{}, fmt.Errorf("invalid month %q, expected YYYY-MM", s)
	}
	return Month{t.Year(), t.Month()}, nil
}

func MonthOf(t time.Time) Month {
	j := t.In(Jakarta)
	return Month{j.Year(), j.Month()}
}

func (m Month) String() string { return fmt.Sprintf("%04d-%02d", m.Year, int(m.Month)) }

func (m Month) Start() time.Time { return time.Date(m.Year, m.Month, 1, 0, 0, 0, 0, Jakarta) }

func (m Month) End() time.Time { return m.Start().AddDate(0, 1, 0) }

func (m Month) Add(n int) Month { return MonthOf(m.Start().AddDate(0, n, 0)) }

func (m Month) Date() time.Time { return time.Date(m.Year, m.Month, 1, 0, 0, 0, 0, time.UTC) }

func (m Month) Days() int { return m.End().AddDate(0, 0, -1).Day() }

func StartOfTomorrow(now time.Time) time.Time {
	j := now.In(Jakarta)
	return time.Date(j.Year(), j.Month(), j.Day()+1, 0, 0, 0, 0, Jakarta)
}

func Today(now time.Time) time.Time {
	j := now.In(Jakarta)
	return time.Date(j.Year(), j.Month(), j.Day(), 0, 0, 0, 0, time.UTC)
}

var minDate = time.Date(2000, 1, 1, 0, 0, 0, 0, Jakarta)

func ValidOccurredAt(t, now time.Time) bool {
	return !t.Before(minDate) && t.Before(StartOfTomorrow(now))
}

func Round2(f float64) float64 { return math.Round(f*100) / 100 }

func FormatIDR(v int64) string {
	neg := v < 0
	if neg {
		v = -v
	}
	s := strconv.FormatInt(v, 10)
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(r)
	}
	if neg {
		return "-Rp" + b.String()
	}
	return "Rp" + b.String()
}

type BudgetStatus string

const (
	BudgetSafe    BudgetStatus = "safe"
	BudgetWarning BudgetStatus = "warning"
	BudgetOver    BudgetStatus = "over"
)

type BudgetProgress struct {
	LimitIDR     int64        `json:"limit_idr"`
	SpentIDR     int64        `json:"spent_idr"`
	RemainingIDR int64        `json:"remaining_idr"`
	UsagePct     float64      `json:"usage_pct"`
	Status       BudgetStatus `json:"status"`
}

func ComputeBudget(limit, spent int64) BudgetProgress {
	p := BudgetProgress{LimitIDR: limit, SpentIDR: spent, RemainingIDR: limit - spent, Status: BudgetSafe}
	if limit <= 0 {
		return p
	}
	p.UsagePct = Round2(float64(spent) * 100 / float64(limit))
	switch {
	case spent >= limit:
		p.Status = BudgetOver
	case spent*100 >= limit*80:
		p.Status = BudgetWarning
	}
	return p
}

func GoalProgressPct(saved, target int64) float64 {
	if target <= 0 || saved <= 0 {
		return 0
	}
	return math.Min(100, Round2(float64(saved)*100/float64(target)))
}

type AllocationType string

const (
	Allocate AllocationType = "allocate"
	Release  AllocationType = "release"
)

var (
	ErrExceedsAvailable = errors.New("allocation exceeds available to spend")
	ErrExceedsTarget    = errors.New("allocation exceeds goal target")
	ErrExceedsSaved     = errors.New("release exceeds goal saved amount")
	ErrInvalidType      = errors.New("invalid allocation type")
)

func CheckAllocation(kind AllocationType, amount, goalSaved, goalTarget, available int64) error {
	switch kind {
	case Allocate:
		if amount > max(0, available) {
			return ErrExceedsAvailable
		}
		if goalSaved+amount > goalTarget {
			return ErrExceedsTarget
		}
	case Release:
		if amount > goalSaved {
			return ErrExceedsSaved
		}
	default:
		return ErrInvalidType
	}
	return nil
}
