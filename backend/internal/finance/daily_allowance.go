package finance

import "time"

type DailyAllowance struct {
	AmountIDR     int64  `json:"amount_idr"`
	DaysRemaining int    `json:"days_remaining"`
	Period        string `json:"period"`
	AsOfDate      string `json:"as_of_date"`
}

// ComputeDailyAllowance divides the unspent budget, including today, in whole rupiah.
// This is a planning allowance, not an account balance or a spending restriction.
func ComputeDailyAllowance(remaining int64, month Month, now time.Time) DailyAllowance {
	today := now.In(Jakarta)
	result := DailyAllowance{Period: "current", AsOfDate: today.Format("2006-01-02")}
	switch {
	case !today.Before(month.End()):
		result.Period = "past"
		return result
	case today.Before(month.Start()):
		result.Period = "future"
		result.DaysRemaining = month.Days()
	default:
		result.DaysRemaining = month.Days() - today.Day() + 1
	}
	if remaining > 0 {
		result.AmountIDR = remaining / int64(result.DaysRemaining)
	}
	return result
}
