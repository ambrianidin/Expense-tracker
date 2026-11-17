package notification

import (
	"net/http"
	"time"

	"budgetly/internal/auth"
	"budgetly/internal/httpx"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct{ DB *pgxpool.Pool }

func (h *Handler) Routes(r chi.Router) {
	r.Get("/notifications", httpx.H(h.list))
	r.Patch("/notifications/read-all", httpx.H(h.readAll))
	r.Patch("/notifications/{id}/read", httpx.H(h.read))
	r.Get("/bill-reminders", httpx.H(h.listBills))
	r.Post("/bill-reminders", httpx.H(h.createBill))
	r.Patch("/bill-reminders/{id}", httpx.H(h.updateBill))
	r.Patch("/bill-reminders/{id}/complete", httpx.H(h.completeBill))
	r.Delete("/bill-reminders/{id}", httpx.H(h.deleteBill))
}

type Item struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Href      string     `json:"href"`
	ReadAt    *time.Time `json:"read_at"`
	CreatedAt time.Time  `json:"created_at"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) error {
	userID := auth.UserID(r.Context())
	if err := WithRefresh(r.Context(), h.DB, userID, nil); err != nil {
		return err
	}
	page, size := httpx.Page(r, 20, 100)
	// Bound the offset as well as the page size.
	if page > 1000000 {
		return httpx.FieldError("page", "Halaman terlalu besar.")
	}
	unread := r.URL.Query().Get("unread_only") == "true"
	var total, unreadCount int64
	if err := h.DB.QueryRow(r.Context(), `SELECT COUNT(*), COUNT(*) FILTER(WHERE read_at IS NULL) FROM notifications WHERE user_id=$1`, userID).Scan(&total, &unreadCount); err != nil {
		return err
	}
	if unread {
		total = unreadCount
	}
	rows, err := h.DB.Query(r.Context(), `SELECT id,kind,title,body,href,read_at,created_at FROM notifications
 WHERE user_id=$1 AND (NOT $2::boolean OR read_at IS NULL)
 ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4`, userID, unread, size, (page-1)*size)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []Item{}
	for rows.Next() {
		var item Item
		if err := rows.Scan(&item.ID, &item.Kind, &item.Title, &item.Body, &item.Href, &item.ReadAt, &item.CreatedAt); err != nil {
			return err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": items, "total": total, "unread_count": unreadCount, "page": page, "page_size": size})
	return nil
}

func (h *Handler) read(w http.ResponseWriter, r *http.Request) error {
	id, err := httpx.IDParam(r, "id", "Notifikasi tidak ditemukan.")
	if err != nil {
		return err
	}
	tag, err := h.DB.Exec(r.Context(), `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2`, id, auth.UserID(r.Context()))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpx.NotFound("Notifikasi tidak ditemukan.")
	}
	httpx.NoContent(w)
	return nil
}

func (h *Handler) readAll(w http.ResponseWriter, r *http.Request) error {
	_, err := h.DB.Exec(r.Context(), `UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, auth.UserID(r.Context()))
	if err != nil {
		return err
	}
	httpx.NoContent(w)
	return nil
}
