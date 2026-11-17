"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, Check, CheckCheck, ChevronLeft, ChevronRight, CircleAlert, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { Card, EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api/client";
import { useNotifications } from "@/lib/api/hooks";
import { dateLabel, dayKey, timeLabel } from "@/lib/format";
import { ReminderPanel } from "./reminder-panel";

export function NotificationsPage() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const query = useNotifications(filter === "unread", page);
  const qc = useQueryClient();
  const markRead = useMutation({
    mutationFn: (id: string | null) => api<void>(id ? `/notifications/${id}/read` : "/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (err: Error) => toast.error(err.message),
  });
  const data = query.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? 20)));

  return (
    <div>
      <PageHeader title="Notifikasi" subtitle="Peringatan budget dan pengingat tagihan dalam satu tempat." />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-label="Pusat notifikasi" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Filter notifikasi" size="sm" value={filter} onChange={(value) => { setFilter(value); setPage(1); }} options={[{ value: "all", label: "Semua" }, { value: "unread", label: "Belum dibaca" }]} />
            <Button size="sm" variant="ghost" icon={CheckCheck} loading={markRead.isPending && markRead.variables === null} disabled={!data?.unread_count || markRead.isPending} onClick={() => markRead.mutate(null)}>Baca semua</Button>
          </div>
          {query.isError ? <ErrorNote message={query.error.message} onRetry={() => query.refetch()} /> : query.isPending ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-36 rounded-3xl" />)}</div>
          ) : !data?.items.length ? (
            <Card><EmptyState icon={Bell} title={filter === "unread" ? "Semua sudah dibaca" : "Belum ada notifikasi"} description="Peringatan muncul saat budget mencapai 80% atau 100%, serta ketika tagihan mendekati jatuh tempo." /></Card>
          ) : (
            <ul className="space-y-3">
              {data.items.map(item => {
                const unread = !item.read_at;
                const Icon = item.kind === "bill_due" ? ReceiptText : CircleAlert;
                return (
                  <li key={item.id}>
                    <Card className={clsx("p-4 sm:p-5", unread && "border-primary/25 bg-primary-tint/20")}>
                      <div className="flex items-start gap-3">
                        <span className={clsx("inline-flex size-9 shrink-0 items-center justify-center rounded-xl", item.kind === "budget_exceeded" ? "bg-bad-tint text-bad-ink" : item.kind === "budget_warning" ? "bg-warn-tint text-warn-ink" : "bg-primary-tint text-primary-ink")}><Icon className="size-[18px]" aria-hidden /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h2 className="break-words text-sm font-bold leading-relaxed">{item.title}</h2>
                            {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Belum dibaca" />}
                          </div>
                          <p className="mt-1 break-words text-[13px] leading-relaxed text-ink-soft">{item.body}</p>
                          <time dateTime={item.created_at} className="mt-2 block text-xs text-muted">{dateLabel(dayKey(item.created_at))} · {timeLabel(item.created_at)} WIB</time>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {item.kind !== "bill_due" && <Link href={item.href} className="rounded-full px-2 py-1 text-xs font-semibold text-primary-ink hover:bg-primary-tint">Lihat budget</Link>}
                            {unread ? <Button size="sm" variant="ghost" icon={Check} loading={markRead.isPending && markRead.variables === item.id} disabled={markRead.isPending} onClick={() => markRead.mutate(item.id)}>Tandai dibaca</Button> : <span className="text-xs text-muted">Sudah dibaca</span>}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
          {(pages > 1 || page > 1) && <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
            <span className="text-xs text-muted">Halaman {page}</span>
            <Button size="sm" variant="secondary" icon={ChevronRight} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Berikutnya</Button>
          </div>}
          <p className="text-xs leading-relaxed text-muted">Diperbarui otomatis selama aplikasi terbuka. Notifikasi budget adalah catatan saat ambang tercapai; cek halaman Budget untuk angka terbaru.</p>
        </section>
        <ReminderPanel />
      </div>
    </div>
  );
}
