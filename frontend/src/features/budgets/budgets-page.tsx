"use client";

import clsx from "clsx";
import { ChartPie, Info, Pencil, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { Field, MoneyInput, Select } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { BudgetBadge, Card, EmptyState, ErrorNote, IconTile, Meter, MonthPicker, PageHeader, Skeleton, budgetTone } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { useBudgets, useCategories, useFinanceMutation } from "@/lib/api/hooks";
import type { Budget } from "@/lib/api/types";
import { iconFor } from "@/lib/catalog";
import { currentMonth, monthLabel, pct, rupiah } from "@/lib/format";

export function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const budgetsQ = useBudgets(month);
  const [editing, setEditing] = useState<Budget | "new" | null>(null);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const remove = useFinanceMutation((b: Budget) => api<void>(`/budgets/${b.id}`, { method: "DELETE" }));

  const data = budgetsQ.data;
  const totals = data?.totals;
  const overallStatus = !totals || totals.limit_idr === 0 ? "safe" : totals.spent_idr >= totals.limit_idr ? "over" : totals.spent_idr * 100 >= totals.limit_idr * 80 ? "warning" : "safe";

  async function onDelete(b: Budget) {
    try {
      await remove.mutateAsync(b);
      toast.success(`Budget ${b.category.name} dihapus`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal menghapus budget.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle="Batas pengeluaran per kategori setiap bulan."
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Button icon={Plus} onClick={() => setEditing("new")}>
              Tambah budget
            </Button>
          </>
        }
      />

      <div className="mb-5 flex items-start gap-2.5 text-[13px] text-ink-soft">
        <Info className="mt-0.5 size-4 shrink-0 text-[var(--sky-ink)]" />
        <p>Budget hanya pembanding, bukan uang yang dipindahkan. Pengeluaran tetap bisa dicatat meski budget terlampaui.</p>
      </div>

      {budgetsQ.isError && <ErrorNote message={budgetsQ.error.message} onRetry={() => budgetsQ.refetch()} />}

      {budgetsQ.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-[28px]" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={ChartPie}
            color="butter"
            title={`Belum ada budget untuk ${monthLabel(month)}`}
            description="Pilih kategori pengeluaran dan tentukan batasnya. Kamu akan diberi tanda saat pemakaian mencapai 80% dan 100%."
            action={<Button icon={Plus} onClick={() => setEditing("new")}>Tambah budget</Button>}
          />
        </Card>
      ) : (
        <div className={clsx(budgetsQ.isPlaceholderData && "opacity-60")}>
          {totals && (
            <Card className="mb-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-muted">Total terpakai · {monthLabel(month)}</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight">
                    {rupiah(totals.spent_idr)} <span className="text-base font-semibold text-muted">/ {rupiah(totals.limit_idr)}</span>
                  </p>
                </div>
                <p className={clsx("text-sm font-semibold", totals.remaining_idr < 0 ? "text-bad-ink" : "text-ink-soft")}>
                  {totals.remaining_idr >= 0 ? `Sisa ${rupiah(totals.remaining_idr)}` : `Lebih ${rupiah(-totals.remaining_idr)}`}
                </p>
              </div>
              <div className="mt-4">
                <Meter value={totals.usage_pct} color={budgetTone[overallStatus].fill} track={budgetTone[overallStatus].track} label={`Total budget terpakai ${pct(totals.usage_pct)}`} />
              </div>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((b) => {
              const t = budgetTone[b.status];
              return (
                <Card key={b.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <IconTile icon={iconFor(b.category.icon)} color={b.category.color} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{b.category.name}</p>
                      <div className="mt-1">
                        <BudgetBadge status={b.status} usage={b.usage_pct} />
                      </div>
                    </div>
                    <div className="-mr-2 -mt-1 flex">
                      <IconButton icon={Pencil} label={`Ubah budget ${b.category.name}`} size="sm" onClick={() => setEditing(b)} />
                      <IconButton icon={Trash} label={`Hapus budget ${b.category.name}`} size="sm" tone="danger" onClick={() => setDeleting(b)} />
                    </div>
                  </div>
                  <div className="mt-5 flex items-baseline justify-between gap-2">
                    <p className="tnum text-lg font-extrabold tracking-tight">{rupiah(b.spent_idr)}</p>
                    <p className="tnum text-[13px] font-semibold text-muted">{pct(b.usage_pct)} dari {rupiah(b.limit_idr)}</p>
                  </div>
                  <div className="mt-2">
                    <Meter value={b.usage_pct} color={t.fill} track={t.track} label={`Budget ${b.category.name} terpakai ${pct(b.usage_pct)}`} />
                  </div>
                  <p className={clsx("mt-2.5 text-[13px] font-semibold", b.remaining_idr < 0 ? "text-bad-ink" : "text-ink-soft")}>
                    {b.remaining_idr >= 0 ? `Sisa ${rupiah(b.remaining_idr)}` : `Melebihi ${rupiah(-b.remaining_idr)}`}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <BudgetModal month={month} initial={editing === "new" ? undefined : editing} existing={data?.items ?? []} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Hapus budget ${deleting.category.name}?`}
          message="Hanya batas budget yang dihapus. Riwayat pengeluaranmu tidak berubah."
          confirmLabel="Hapus budget"
          loading={remove.isPending}
          onConfirm={() => onDelete(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function BudgetModal({ month, initial, existing, onClose }: { month: string; initial?: Budget; existing: Budget[]; onClose: () => void }) {
  const editing = !!initial;
  const categoriesQ = useCategories(false);
  const used = new Set(existing.map((b) => b.category.id));
  const options = (categoriesQ.data ?? []).filter((c) => c.type === "expense" && !used.has(c.id));
  const [categoryId, setCategoryId] = useState(initial?.category.id ?? "");
  const [limit, setLimit] = useState<number | null>(initial?.limit_idr ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const save = useFinanceMutation((body: Record<string, unknown>) =>
    editing ? api<Budget>(`/budgets/${initial!.id}`, { method: "PATCH", body }) : api<Budget>("/budgets", { method: "POST", body }),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!editing && !categoryId) fe.category_id = "Pilih kategori pengeluaran.";
    if (!limit) fe.limit_idr = "Batas budget harus lebih dari 0.";
    setErrors(fe);
    setFormError("");
    if (Object.keys(fe).length) return;
    try {
      await save.mutateAsync(editing ? { limit_idr: limit } : { category_id: categoryId, month, limit_idr: limit });
      toast.success(editing ? "Budget diperbarui" : "Budget dibuat");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Gagal menyimpan budget.");
    }
  }

  return (
    <Modal
      title={editing ? `Ubah budget ${initial!.category.name}` : "Tambah budget"}
      description={`Untuk ${monthLabel(month)}. ${editing ? "Hanya batasnya yang berubah, riwayat pengeluaran tetap." : ""}`}
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <ErrorNote message={formError} />}
        {!editing && (
          <Field label="Kategori pengeluaran" error={errors.category_id} hint={options.length === 0 && !categoriesQ.isPending ? "Semua kategori sudah punya budget bulan ini." : undefined}>
            {(p) => (
              <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Pilih kategori</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Batas per bulan" error={errors.limit_idr}>
          {(p) => <MoneyInput {...p} size="lg" value={limit} onValueChange={setLimit} autoFocus={editing} />}
        </Field>
        {editing && initial && (
          <p className="text-[13px] text-ink-soft">
            Sudah terpakai <b className="text-ink">{rupiah(initial.spent_idr)}</b> bulan ini.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={save.isPending}>
            Simpan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
