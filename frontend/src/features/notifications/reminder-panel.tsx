"use client";

import { CalendarDays, Check, Pencil, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { Badge, Card, CardHeader, EmptyState, ErrorNote, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api/client";
import { useBillReminders, useFinanceMutation } from "@/lib/api/hooks";
import type { BillReminder } from "@/lib/api/types";
import { dateLabel, rupiah, todayISO } from "@/lib/format";
import { ReminderForm } from "./reminder-form";

export function ReminderPanel() {
  const query = useBillReminders();
  const [editing, setEditing] = useState<BillReminder | "new" | null>(null);
  const [deleting, setDeleting] = useState<BillReminder | null>(null);
  const complete = useFinanceMutation((id: string) => api<void>(`/bill-reminders/${id}/complete`, { method: "PATCH" }));
  const remove = useFinanceMutation((id: string) => api<void>(`/bill-reminders/${id}`, { method: "DELETE" }));
  const active = query.data?.items.filter(item => !item.completed_at) ?? [];
  const done = query.data?.items.filter(item => item.completed_at) ?? [];
  const today = todayISO();

  async function finish(id: string) {
    try { await complete.mutateAsync(id); toast.success("Tagihan ditandai selesai"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Gagal memperbarui tagihan."); }
  }
  async function deleteReminder() {
    if (!deleting) return;
    try { await remove.mutateAsync(deleting.id); setDeleting(null); toast.success("Pengingat dihapus"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Gagal menghapus pengingat."); }
  }

  function row(item: BillReminder) {
    const overdue = item.due_date < today;
    return <li key={item.id} className="rounded-2xl border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-bold">{item.title}</p>
          {item.amount_idr !== null && <p className="tnum mt-1 font-bold">{rupiah(item.amount_idr)}</p>}
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">Jatuh tempo {dateLabel(item.due_date)}</p>
        </div>
        <div className="-mr-1 -mt-1 flex shrink-0">
          {!item.completed_at && <IconButton size="sm" icon={Pencil} label={`Ubah tagihan ${item.title}`} onClick={() => setEditing(item)} />}
          <IconButton size="sm" icon={Trash} tone="danger" label={`Hapus tagihan ${item.title}`} onClick={() => setDeleting(item)} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Badge color={item.completed_at ? "mint" : overdue ? "rose" : item.due_date === today ? "butter" : "lavender"}>{item.completed_at ? "Selesai" : overdue ? "Lewat jatuh tempo" : item.due_date === today ? "Jatuh tempo hari ini" : `Ingatkan ${item.remind_days_before} hari sebelumnya`}</Badge>
        {!item.completed_at && <Button size="sm" variant="soft" icon={Check} loading={complete.isPending && complete.variables === item.id} disabled={complete.isPending} onClick={() => finish(item.id)}>Selesai</Button>}
      </div>
    </li>;
  }

  return <>
    <Card className="min-w-0">
      <CardHeader title="Pengingat tagihan" subtitle="Atur tanggalnya, lalu tandai setelah dibayar." action={<Button size="sm" variant="soft" icon={Plus} onClick={() => setEditing("new")}>Tambah</Button>} />
      <div className="space-y-4 p-4 sm:p-5">
        {query.isError ? <ErrorNote message={query.error.message} onRetry={() => query.refetch()} /> : query.isPending ? <Skeleton className="h-36 rounded-2xl" /> : <>
          {active.length ? <ul className="space-y-3">{active.map(row)}</ul> : <EmptyState compact icon={CalendarDays} title="Tidak ada tagihan aktif" description="Tambahkan kos, listrik, atau langganan agar tidak terlewat." />}
          {done.length > 0 && <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold text-ink-soft">Selesai ({done.length})</summary><ul className="mt-3 space-y-3">{done.map(row)}</ul></details>}
        </>}
        <p className="text-xs leading-relaxed text-muted">Tombol Selesai hanya menutup pengingat. Catat pembayarannya lewat Transaksi agar saldo dan budget ikut diperbarui.</p>
      </div>
    </Card>
    {editing && <ReminderForm initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    {deleting && <ConfirmDialog title={`Hapus pengingat ${deleting.title}?`} message="Pengingat dan notifikasi tagihannya akan dihapus. Catatan transaksi tetap tersimpan." confirmLabel="Hapus pengingat" onClose={() => setDeleting(null)} onConfirm={deleteReminder} loading={remove.isPending} />}
  </>;
}
