package notification

import (
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"budgetly/internal/auth"
	"budgetly/internal/finance"
	"budgetly/internal/httpx"
	"github.com/jackc/pgx/v5"
)

type Bill struct {
	ID               string     `json:"id"`
	Title            string     `json:"title"`
	AmountIDR        *int64     `json:"amount_idr"`
	DueDate          string     `json:"due_date"`
	RemindDaysBefore int        `json:"remind_days_before"`
	CompletedAt      *time.Time `json:"completed_at"`
	CreatedAt        time.Time  `json:"created_at"`
}
type billInput struct {
	Title            string `json:"title"`
	AmountIDR        *int64 `json:"amount_idr"`
	DueDate          string `json:"due_date"`
	RemindDaysBefore int    `json:"remind_days_before"`
}

func (in *billInput) validate() error {
	in.Title = strings.TrimSpace(in.Title)
	v := httpx.NewValidator()
	v.Check(utf8.RuneCountInString(in.Title) > 0 && utf8.RuneCountInString(in.Title) <= 80, "title", "Isi nama tagihan, maksimal 80 karakter.")
	d, err := time.Parse("2006-01-02", in.DueDate)
	v.Check(err == nil && d.Year() >= 2000 && d.Year() <= 2100, "due_date", "Isi tanggal jatuh tempo yang valid.")
	v.Check(in.AmountIDR == nil || finance.ValidAmount(*in.AmountIDR), "amount_idr", "Nominal harus lebih dari 0 dan tidak melebihi batas.")
	v.Check(in.RemindDaysBefore >= 0 && in.RemindDaysBefore <= 30, "remind_days_before", "Pilih 0 sampai 30 hari sebelum jatuh tempo.")
	return v.Err()
}

func (h *Handler) listBills(w http.ResponseWriter, r *http.Request) error {
	rows, err := h.DB.Query(r.Context(), `SELECT id,title,amount_idr,to_char(due_date,'YYYY-MM-DD'),remind_days_before,completed_at,created_at FROM bill_reminders
 WHERE user_id=$1 ORDER BY (completed_at IS NOT NULL),due_date,id`, auth.UserID(r.Context()))
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []Bill{}
	for rows.Next() {
		var b Bill
		if err := rows.Scan(&b.ID, &b.Title, &b.AmountIDR, &b.DueDate, &b.RemindDaysBefore, &b.CompletedAt, &b.CreatedAt); err != nil {
			return err
		}
		items = append(items, b)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
	return nil
}

func (h *Handler) createBill(w http.ResponseWriter, r *http.Request) error {
	return h.saveBill(w, r, false)
}
func (h *Handler) updateBill(w http.ResponseWriter, r *http.Request) error {
	return h.saveBill(w, r, true)
}

func (h *Handler) saveBill(w http.ResponseWriter, r *http.Request, editing bool) error {
	var input billInput
	if err := httpx.Decode(r, &input); err != nil {
		return err
	}
	if err := input.validate(); err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	dueDate, _ := time.Parse("2006-01-02", input.DueDate)
	var b Bill
	if editing {
		var err error
		b.ID, err = httpx.IDParam(r, "id", "Tagihan tidak ditemukan.")
		if err != nil {
			return err
		}
	}
	err := WithRefresh(r.Context(), h.DB, userID, func(tx pgx.Tx) error {
		if editing {
			tag, err := tx.Exec(r.Context(), `UPDATE bill_reminders SET title=$3,amount_idr=$4,due_date=$5,remind_days_before=$6
				WHERE id=$1 AND user_id=$2 AND completed_at IS NULL`, b.ID, userID, input.Title, input.AmountIDR, dueDate, input.RemindDaysBefore)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return httpx.NotFound("Tagihan aktif tidak ditemukan.")
			}
			_, err = tx.Exec(r.Context(), `DELETE FROM notifications WHERE user_id=$1 AND source_key=$2`, userID, "bill:"+b.ID)
			return err
		}
		return tx.QueryRow(r.Context(), `INSERT INTO bill_reminders (user_id,title,amount_idr,due_date,remind_days_before)
		VALUES($1,$2,$3,$4,$5) RETURNING id`, userID, input.Title, input.AmountIDR, dueDate, input.RemindDaysBefore).Scan(&b.ID)
	})
	if err != nil {
		return err
	}
	err = h.DB.QueryRow(r.Context(), `SELECT title,amount_idr,to_char(due_date,'YYYY-MM-DD'),remind_days_before,completed_at,created_at FROM bill_reminders WHERE id=$1 AND user_id=$2`, b.ID, userID).Scan(&b.Title, &b.AmountIDR, &b.DueDate, &b.RemindDaysBefore, &b.CompletedAt, &b.CreatedAt)
	if err != nil {
		return err
	}
	status := http.StatusCreated
	if editing {
		status = http.StatusOK
	}
	httpx.JSON(w, status, b)
	return nil
}

func (h *Handler) completeBill(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", "Tagihan tidak ditemukan.")
	if err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	err = WithRefresh(r.Context(), h.DB, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(r.Context(), `UPDATE bill_reminders SET completed_at=COALESCE(completed_at,now()) WHERE id=$1 AND user_id=$2`, id, userID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.NotFound("Tagihan tidak ditemukan.")
		}
		_, err = tx.Exec(r.Context(), `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND source_key=$2`, userID, "bill:"+id)
		return err
	})
	if err != nil {
		return err
	}
	httpx.NoContent(w)
	return nil
}

func (h *Handler) deleteBill(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", "Tagihan tidak ditemukan.")
	if err != nil {
		return err
	}
	userID := auth.UserID(r.Context())
	err = WithRefresh(r.Context(), h.DB, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(r.Context(), `DELETE FROM bill_reminders WHERE id=$1 AND user_id=$2`, id, userID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return httpx.NotFound("Tagihan tidak ditemukan.")
		}
		_, err = tx.Exec(r.Context(), `DELETE FROM notifications WHERE user_id=$1 AND source_key=$2`, userID, "bill:"+id)
		return err
	})
	if err != nil {
		return err
	}
	httpx.NoContent(w)
	return nil
}
