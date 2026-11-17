# Savena

Budget & savings planner: catat pemasukan/pengeluaran, transfer antar akun, budget bulanan per kategori,
dan tabungan virtual per goal. Semua angka dihitung di server dari data sumber.

| Bagian   | Stack |
| -------- | ----- |
| Frontend | Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4, TanStack Query, Lucide |
| Backend  | Go, Chi, pgx |
| Database | PostgreSQL di Supabase (free tier) |

## Struktur

```text
backend/
  cmd/api/                 entrypoint HTTP API (juga `go run ./cmd/api migrate`)
  internal/finance/        rumus domain murni + unit test (PRD §5)
  internal/ledger/         saldo, snapshot, warning (dihitung ulang dari histori)
  internal/{auth,account,category,transaction,transfer,budget,goal,report}/
  internal/server/         router, middleware, acceptance test TC-01..TC-12
  migrations/              SQL schema (di-embed, dijalankan saat start)
frontend/
  src/app/                 rute: /login /register /onboarding /dashboard /accounts
                           /transactions /budgets /savings /reports /settings
  src/features/            UI per fitur
  src/components/          UI dasar (button, field, modal, meter, ...)
  src/lib/                 API client, hooks, format rupiah & tanggal WIB
```

## Menjalankan secara lokal

1. **Database (Supabase).** Pakai project Supabase baru atau yang sudah dipakai project lain.
   Buka **Connect**, salin URI **Session pooler** (port 5432), lalu salin `backend/.env.example`
   ke `backend/.env` dan isi `DATABASE_URL`. Migrasi berjalan otomatis saat API start.

   Semua tabel Savena dibuat di schema Postgres tersendiri (`DB_SCHEMA`, default `budgetly`),
   dan koneksi hanya melihat schema itu. Tabel project lain di `public` tidak pernah dibaca atau
   diubah, jadi satu database bisa dipakai bersama. Schema `budgetly` tidak diekspos lewat Data
   API Supabase, dan tabelnya juga diberi RLS tanpa policy sebagai lapisan tambahan.

2. **API**
   ```bash
   cd backend
   go run ./cmd/api
   ```

3. **Web**
   ```bash
   cd frontend
   pnpm install
   pnpm dev
   ```
   Buka http://localhost:3000. Next.js mem-proxy `/api/*` ke `BACKEND_URL` (default
   `http://localhost:8080`), sehingga cookie sesi dan CSRF bersifat first-party.
   Kalau API jalan di port lain (misalnya 8080 sudah terpakai), tulis
   `BACKEND_URL=http://localhost:<port>` di `frontend/.env.local`.

## Jatah harian dan notifikasi

- Halaman Budget dan ringkasan Beranda menampilkan jatah harian per kategori: sisa budget
  dibagi sisa hari bulan itu, termasuk hari ini di WIB, dibulatkan ke bawah ke rupiah utuh.
  Budget habis menghasilkan Rp0/hari. Bulan lampau ditandai selesai; bulan mendatang
  menampilkan rencana berdasarkan seluruh hari dalam bulan tersebut.
- Pusat Notifikasi menyimpan peringatan 80% dan 100% di database, sekali per kategori,
  bulan, dan ambang. Peringatan 100% menggantikan status belum dibaca pada peringatan 80%.
  Catatan peringatan tetap ada saat transaksi atau batas budget kemudian diperbaiki.
- Pengingat tagihan manual memiliki nama, tanggal jatuh tempo, nominal opsional, serta
  waktu pengingat 0–30 hari sebelumnya (default UI: 3 hari). Pengingat dapat diubah,
  ditandai selesai, atau dihapus. Menandai selesai tidak mencatat transaksi pembayaran.
- Data disegarkan setiap menit selama aplikasi terbuka dan saat kembali aktif. Budget
  yang sudah mencapai ambang dan tagihan yang jatuh tempo saat aplikasi ditutup akan
  muncul saat dibuka kembali. Status dibaca tersimpan per pengguna, lintas perangkat.
- Migrasi `0002_notifications.sql` menambahkan tabel `notifications` dan `bill_reminders`.
  Jalankan ulang API dengan `MIGRATE_ON_START=true` atau `go run ./cmd/api migrate`.

## Tes

```bash
cd backend
go test ./...                                   # unit test domain
TEST_DATABASE_URL="postgresql://..." go test ./internal/server -run Acceptance -v
```

Acceptance test membuat user sementara `acceptance-*@budgetly.test` di schema `TEST_DB_SCHEMA`
(default `budgetly`) dan menghapusnya setelah selesai. Data project lain di database yang sama tidak tersentuh.

## Keputusan desain penting

- **Uang** disimpan sebagai `BIGINT` rupiah; tidak ada float.
- **Ownership** dijaga dua lapis: query selalu memfilter `user_id`, dan foreign key komposit
  `(id, user_id)` membuat database menolak relasi lintas user. FK `(id, user_id, type)` memastikan
  tipe kategori cocok dengan tipe transaksi.
- **Alokasi tabungan** dijalankan dalam satu transaksi database dengan `SELECT ... FOR UPDATE` pada
  baris user, jadi dua request bersamaan tidak bisa melebihi dana siap pakai (TC-05).
- **Batas bulan** dihitung di zona Asia/Jakarta lalu dikirim sebagai `TIMESTAMPTZ`.
- **Auth**: sesi di cookie HttpOnly (token di-hash SHA-256 di DB), password bcrypt, CSRF
  double-submit + cek Origin, rate limit login/register.
