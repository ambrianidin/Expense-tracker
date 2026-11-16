package ledger

import (
	"context"
	"strings"
	"time"

	"budgetly/internal/finance"
	"budgetly/internal/httpx"
	"budgetly/internal/platform/db"
)

func RequireActiveAccount(ctx context.Context, q db.Querier, v *httpx.Validator, field, userID, accountID string, allowArchived bool) error {
	if !httpx.IsUUID(accountID) {
		v.Add(field, "Pilih akun.")
		return nil
	}
	var archived bool
	err := q.QueryRow(ctx, `SELECT is_archived FROM accounts WHERE id = $1 AND user_id = $2`, accountID, userID).Scan(&archived)
	if db.IsNoRows(err) {
		v.Add(field, "Akun tidak ditemukan.")
		return nil
	}
	if err != nil {
		return err
	}
	v.Check(!archived || allowArchived, field, "Akun ini sudah diarsipkan.")
	return nil
}

func ParseOccurredAt(v *httpx.Validator, field, raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		v.Add(field, "Tanggal wajib diisi.")
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		d, derr := time.ParseInLocation("2006-01-02", raw, finance.Jakarta)
		if derr != nil {
			v.Add(field, "Format tanggal tidak valid.")
			return time.Time{}
		}
		t = d.Add(12 * time.Hour)
	}
	if !finance.ValidOccurredAt(t, time.Now()) {
		v.Add(field, "Tanggal tidak boleh di masa depan atau sebelum tahun 2000.")
	}
	return t.UTC()
}

func DateRange(v *httpx.Validator, month, from, to string) (start, end *time.Time) {
	if month != "" {
		m, err := finance.ParseMonth(month)
		if err != nil {
			v.Add("month", "Format bulan harus YYYY-MM.")
			return nil, nil
		}
		s, e := m.Start(), m.End()
		return &s, &e
	}
	if from != "" {
		d, err := time.ParseInLocation("2006-01-02", from, finance.Jakarta)
		if err != nil {
			v.Add("from", "Format tanggal tidak valid.")
		} else {
			start = &d
		}
	}
	if to != "" {
		d, err := time.ParseInLocation("2006-01-02", to, finance.Jakarta)
		if err != nil {
			v.Add("to", "Format tanggal tidak valid.")
		} else {
			next := d.AddDate(0, 0, 1)
			end = &next
		}
	}
	if start != nil && end != nil && !start.Before(*end) {
		v.Add("to", "Tanggal akhir harus setelah tanggal awal.")
	}
	return start, end
}

func LikePattern(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(s) + "%"
}
