"use client";

import clsx from "clsx";
import { Archive, ArchiveArrowUp, ArrowRight, ArrowRightLeft, Pencil, Plus, Trash, TriangleExclamationPoint, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { Badge, Card, CardHeader, EmptyState, ErrorNote, IconTile, PageHeader, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { useAccounts, useFinanceMutation, useTransfers } from "@/lib/api/hooks";
import type { Account, Transfer } from "@/lib/api/types";
import { accountMeta } from "@/lib/catalog";
import { dateLabel, dayKey, rupiah } from "@/lib/format";
import { AccountModal, TransferModal } from "./account-forms";

export function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const accountsQ = useAccounts(true);
  const transfersQ = useTransfers();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [transfer, setTransfer] = useState<string | true | null>(null);
  const [archiving, setArchiving] = useState<Account | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState<Transfer | null>(null);

  const archive = useFinanceMutation((a: Account) => api<Account>(`/accounts/${a.id}`, { method: "PATCH", body: { is_archived: !a.is_archived } }));
  const removeTransfer = useFinanceMutation((t: Transfer) => api<void>(`/transfers/${t.id}`, { method: "DELETE" }));

  const all = accountsQ.data?.items ?? [];
  const active = all.filter((a) => !a.is_archived);
  const archived = all.filter((a) => a.is_archived);
  const summary = accountsQ.data?.summary;

  async function toggleArchive(a: Account) {
    try {
      await archive.mutateAsync(a);
      toast.success(a.is_archived ? `${a.name} dipulihkan` : `${a.name} diarsipkan`, {
        description: a.is_archived ? undefined : "Riwayatnya tetap dihitung di saldo dan laporan.",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal memperbarui akun.");
    } finally {
      setArchiving(null);
    }
  }

  async function deleteTransfer(t: Transfer) {
    try {
      await removeTransfer.mutateAsync(t);
      toast.success("Transfer dihapus");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menghapus transfer.");
    } finally {
      setDeletingTransfer(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Akun"
        subtitle="Cash, bank, dan e-wallet. Saldo dihitung dari saldo awal dan seluruh riwayat."
        actions={
          <>
            <Button variant="secondary" icon={ArrowRightLeft} onClick={() => setTransfer(true)} disabled={active.length < 2}>
              Transfer
            </Button>
            <Button icon={Plus} onClick={() => setEditing("new")}>
              Tambah akun
            </Button>
          </>
        }
      />

      {accountsQ.isError && <ErrorNote message={accountsQ.error.message} onRetry={() => accountsQ.refetch()} />}

      {accountsQ.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-[28px]" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            color="sky"
            title="Belum ada akun"
            description="Tambahkan akun pertamamu untuk mulai mencatat."
            action={<Button icon={Plus} onClick={() => setEditing("new")}>Tambah akun</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[28px] border border-line bg-surface px-6 py-4 shadow-soft">
            <div>
              <p className="text-[13px] font-semibold text-muted">Total saldo</p>
              <p className={clsx("text-2xl font-extrabold tracking-tight", (summary?.total_balance_idr ?? 0) < 0 && "text-bad-ink")}>
                {rupiah(summary?.total_balance_idr ?? 0)}
              </p>
            </div>
            <div className="h-10 w-px bg-line max-sm:hidden" />
            <p className="text-sm text-ink-soft">
              {active.length} akun aktif{archived.length ? ` · ${archived.length} diarsipkan (tetap dihitung)` : ""}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((a) => (
              <AccountCard key={a.id} account={a} onEdit={() => setEditing(a)} onArchive={() => setArchiving(a)} onTransfer={() => setTransfer(a.id)} />
            ))}
          </div>

          {archived.length > 0 && (
            <div className="mt-6">
              <button onClick={() => setShowArchived((s) => !s)} className="text-sm font-semibold text-ink-soft hover:text-ink">
                {showArchived ? "Sembunyikan" : "Tampilkan"} akun diarsipkan ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {archived.map((a) => (
                    <AccountCard key={a.id} account={a} onEdit={() => setEditing(a)} onArchive={() => toggleArchive(a)} />
                  ))}
                </div>
              )}
            </div>
          )}

          <Card className="mt-8">
            <CardHeader title="Riwayat transfer" subtitle="Transfer tidak dihitung sebagai pemasukan atau pengeluaran." />
            <div className="px-3 pb-4 pt-3 sm:px-4">
              {transfersQ.isPending ? (
                <Skeleton className="m-2 h-16" />
              ) : transfersQ.data?.items.length ? (
                <ul>
                  {transfersQ.data.items.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-sunken/60">
                      <IconTile icon={ArrowRightLeft} color="lavender" size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                          {t.from_account.name}
                          <ArrowRight className="size-3.5 shrink-0 text-muted" />
                          {t.to_account.name}
                        </p>
                        <p className="truncate text-[13px] text-muted">
                          {[t.note, dateLabel(dayKey(t.occurred_at))].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="tnum text-sm font-bold">{rupiah(t.amount_idr)}</span>
                      <IconButton icon={Trash} label="Hapus transfer" tone="danger" size="sm" onClick={() => setDeletingTransfer(t)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-6 text-center text-sm text-muted">Belum ada transfer.</p>
              )}
            </div>
          </Card>
        </>
      )}

      {editing && <AccountModal initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {transfer && <TransferModal defaultFrom={typeof transfer === "string" ? transfer : undefined} onClose={() => setTransfer(null)} />}
      {archiving && (
        <ConfirmDialog
          title={`Arsipkan ${archiving.name}?`}
          tone="primary"
          message="Akun disembunyikan dari pilihan transaksi baru. Riwayat dan saldonya tetap dihitung di total saldo dan laporan. Kamu bisa memulihkannya kapan saja."
          confirmLabel="Arsipkan"
          loading={archive.isPending}
          onConfirm={() => toggleArchive(archiving)}
          onClose={() => setArchiving(null)}
        />
      )}
      {deletingTransfer && (
        <ConfirmDialog
          title="Hapus transfer ini?"
          message={`Transfer ${rupiah(deletingTransfer.amount_idr)} dari ${deletingTransfer.from_account.name} ke ${deletingTransfer.to_account.name} akan dihapus dan saldo kedua akun dihitung ulang.`}
          confirmLabel="Ya, hapus"
          loading={removeTransfer.isPending}
          onConfirm={() => deleteTransfer(deletingTransfer)}
          onClose={() => setDeletingTransfer(null)}
        />
      )}
    </div>
  );
}

function AccountCard({ account: a, onEdit, onArchive, onTransfer }: { account: Account; onEdit: () => void; onArchive: () => void; onTransfer?: () => void }) {
  const meta = accountMeta(a.type);
  const negative = a.balance_idr < 0;
  return (
    <Card className={clsx("flex flex-col p-5 transition hover:shadow-lift", a.is_archived && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={meta.icon} color={meta.color} size="md" />
          <div className="min-w-0">
            <p className="truncate font-bold">{a.name}</p>
            <p className="text-[13px] text-muted">{meta.label}</p>
          </div>
        </div>
        <div className="-mr-2 -mt-1 flex">
          <IconButton icon={Pencil} label={`Edit ${a.name}`} size="sm" onClick={onEdit} />
          <IconButton icon={a.is_archived ? ArchiveArrowUp : Archive} label={a.is_archived ? `Pulihkan ${a.name}` : `Arsipkan ${a.name}`} size="sm" onClick={onArchive} />
        </div>
      </div>
      <p className={clsx("mt-6 text-[26px] font-extrabold tracking-tight", negative && "text-bad-ink")}>{rupiah(a.balance_idr)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {negative && (
          <Badge color="rose" icon={TriangleExclamationPoint}>
            Saldo minus
          </Badge>
        )}
        {a.is_archived && <Badge color="sand" icon={Archive}>Diarsipkan</Badge>}
        <span className="text-[12px] text-muted">Saldo awal {rupiah(a.opening_balance_idr)}</span>
      </div>
      {onTransfer && (
        <button onClick={onTransfer} className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full text-[13px] font-semibold text-primary-ink hover:underline">
          <ArrowRightLeft className="size-3.5" />
          Transfer dari akun ini
        </button>
      )}
    </Card>
  );
}
