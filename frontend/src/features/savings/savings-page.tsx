"use client";

import clsx from "clsx";
import { Archive, ArchiveArrowUp, CalendarDays, CircleCheck, CircleMinus, CirclePlus, Clock, Pencil, PiggyBank, Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { Badge, Card, EmptyState, ErrorNote, IconTile, Meter, PageHeader, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { useFinanceMutation, useGoals } from "@/lib/api/hooks";
import type { Goal } from "@/lib/api/types";
import { iconFor, tone } from "@/lib/catalog";
import { dateLabel, monthsUntil, pct, rupiah } from "@/lib/format";
import { AllocationModal, GoalModal, HistoryModal } from "./goal-forms";

export function SavingsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const goalsQ = useGoals("all");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [allocating, setAllocating] = useState<{ goal: Goal; type: "allocate" | "release" } | null>(null);
  const [history, setHistory] = useState<Goal | null>(null);
  const [archiving, setArchiving] = useState<Goal | null>(null);

  const setStatus = useFinanceMutation(({ goal, status, release }: { goal: Goal; status: "active" | "archived"; release?: boolean }) =>
    api<Goal>(`/savings-goals/${goal.id}`, { method: "PATCH", body: { status, ...(release ? { release_remaining: true } : {}) } }),
  );

  const items = goalsQ.data?.items ?? [];
  const active = items.filter((g) => g.status === "active");
  const archived = items.filter((g) => g.status === "archived");
  const summary = goalsQ.data?.summary;

  async function archive(goal: Goal, status: "active" | "archived") {
    try {
      await setStatus.mutateAsync({ goal, status, release: status === "archived" && goal.saved_idr > 0 });
      toast.success(status === "archived" ? `${goal.title} diarsipkan` : `${goal.title} diaktifkan lagi`, {
        description: status === "archived" && goal.saved_idr > 0 ? `${rupiah(goal.saved_idr)} kembali ke dana siap pakai.` : undefined,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal memperbarui goal.");
    } finally {
      setArchiving(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tabungan"
        subtitle="Sisihkan dana untuk tujuanmu tanpa memindahkan uang dari akun."
        actions={
          <Button icon={Plus} onClick={() => setEditing("new")}>
            Goal baru
          </Button>
        }
      />

      {goalsQ.isError && <ErrorNote message={goalsQ.error.message} onRetry={() => goalsQ.refetch()} />}

      {summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Card className="flex items-center gap-4 p-5">
            <IconTile icon={PiggyBank} color="mint" size="lg" tilt />
            <div>
              <p className="text-[13px] font-semibold text-muted">Dana tersisih</p>
              <p className="text-2xl font-extrabold tracking-tight">{rupiah(summary.reserved_savings_idr)}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4 p-5">
            <IconTile icon={Wallet} color="lavender" size="lg" />
            <div>
              <p className="text-[13px] font-semibold text-muted">Siap dipakai</p>
              <p className={clsx("text-2xl font-extrabold tracking-tight", summary.available_to_spend_idr < 0 && "text-bad-ink")}>
                {rupiah(summary.available_to_spend_idr)}
              </p>
              <p className="text-[12px] text-muted">dari total saldo {rupiah(summary.total_balance_idr)}</p>
            </div>
          </Card>
        </div>
      )}

      {goalsQ.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60 rounded-[28px]" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            color="mint"
            title="Belum ada goal aktif"
            description="Buat target seperti laptop, dana darurat, atau liburan. Sisihkan dananya sedikit demi sedikit."
            action={<Button icon={Plus} onClick={() => setEditing("new")}>Buat goal pertama</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onAllocate={() => setAllocating({ goal: g, type: "allocate" })}
              onRelease={() => setAllocating({ goal: g, type: "release" })}
              onEdit={() => setEditing(g)}
              onHistory={() => setHistory(g)}
              onArchive={() => setArchiving(g)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowArchived((s) => !s)} className="text-sm font-semibold text-ink-soft hover:text-ink">
            {showArchived ? "Sembunyikan" : "Tampilkan"} goal diarsipkan ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {archived.map((g) => (
                <li key={g.id} className="flex items-center gap-3 rounded-[22px] border border-line bg-surface p-4 opacity-80">
                  <IconTile icon={iconFor(g.icon)} color={g.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.title}</p>
                    <p className="text-[12px] text-muted">Target {rupiah(g.target_amount_idr)}</p>
                  </div>
                  <IconButton icon={Clock} label={`Riwayat ${g.title}`} size="sm" onClick={() => setHistory(g)} />
                  <IconButton icon={ArchiveArrowUp} label={`Aktifkan ${g.title}`} size="sm" onClick={() => archive(g, "active")} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <GoalModal initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {allocating && (
        <AllocationModal goal={allocating.goal} defaultType={allocating.type} summary={summary} onClose={() => setAllocating(null)} />
      )}
      {history && <HistoryModal goal={history} onClose={() => setHistory(null)} />}
      {archiving && (
        <ConfirmDialog
          title={`Arsipkan ${archiving.title}?`}
          tone="primary"
          message={
            archiving.saved_idr > 0 ? (
              <>
                Goal ini masih menyimpan <b className="text-ink">{rupiah(archiving.saved_idr)}</b>. Dana tersebut akan dilepas dulu dan kembali ke saldo siap pakai,
                lalu goal diarsipkan.
              </>
            ) : (
              "Goal disembunyikan dari daftar aktif. Riwayatnya tetap tersimpan."
            )
          }
          confirmLabel={archiving.saved_idr > 0 ? "Lepas dana & arsipkan" : "Arsipkan"}
          loading={setStatus.isPending}
          onConfirm={() => archive(archiving, "archived")}
          onClose={() => setArchiving(null)}
        />
      )}
    </div>
  );
}

type GoalCardProps = { goal: Goal; onAllocate: () => void; onRelease: () => void; onEdit: () => void; onHistory: () => void; onArchive: () => void };

function GoalCard({ goal: g, onAllocate, onRelease, onEdit, onHistory, onArchive }: GoalCardProps) {
  const t = tone(g.color);
  const months = g.target_date ? monthsUntil(g.target_date) : null;
  const perMonth = months && months > 0 && !g.is_completed ? Math.ceil(g.remaining_idr / months) : null;
  return (
    <Card className="flex flex-col p-5 transition hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <IconTile icon={iconFor(g.icon)} color={g.color} size="lg" tilt />
        <div className="-mr-2 -mt-1 flex">
          <IconButton icon={Clock} label={`Riwayat ${g.title}`} size="sm" onClick={onHistory} />
          <IconButton icon={Pencil} label={`Edit ${g.title}`} size="sm" onClick={onEdit} />
          <IconButton icon={Archive} label={`Arsipkan ${g.title}`} size="sm" onClick={onArchive} />
        </div>
      </div>
      <p className="mt-4 truncate text-[17px] font-bold">{g.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {g.is_completed ? (
          <Badge color="mint" icon={CircleCheck}>
            Tercapai
          </Badge>
        ) : (
          <span className="tnum text-[13px] font-semibold text-muted">{pct(g.progress_pct)}</span>
        )}
        {g.target_date && (
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <CalendarDays className="size-3.5" />
            {dateLabel(g.target_date)}
          </span>
        )}
      </div>
      <div className="mt-4">
        <Meter value={g.progress_pct} color={t.strong} track={t.tint} label={`Progres ${g.title} ${pct(g.progress_pct)}`} />
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <p className="tnum text-lg font-extrabold tracking-tight">{rupiah(g.saved_idr)}</p>
        <p className="tnum text-[13px] text-muted">dari {rupiah(g.target_amount_idr)}</p>
      </div>
      <p className="mt-1 min-h-5 text-[12px] text-ink-soft">
        {g.is_completed
          ? "Dana sudah lengkap. Lepaskan saat akan dipakai."
          : perMonth
            ? `Sekitar ${rupiah(perMonth)}/bulan agar tepat waktu.`
            : months !== null && months <= 0
              ? `Tenggat bulan ini. Kurang ${rupiah(g.remaining_idr)} lagi.`
              : `Kurang ${rupiah(g.remaining_idr)} lagi.`}
      </p>
      <div className="mt-5 flex gap-2">
        <Button size="sm" className="flex-1" icon={CirclePlus} onClick={onAllocate} disabled={g.is_completed}>
          Sisihkan
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" icon={CircleMinus} onClick={onRelease} disabled={g.saved_idr === 0}>
          Lepaskan
        </Button>
      </div>
    </Card>
  );
}
