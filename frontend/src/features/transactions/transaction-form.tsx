"use client";

import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight, Trash, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, MoneyInput, Segmented, Textarea } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { EmptyState, ErrorNote, IconTile, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { useAccounts, useCategories, useFinanceMutation, type TxWriteResult } from "@/lib/api/hooks";
import type { Transaction, TxType, Warnings } from "@/lib/api/types";
import { accountMeta, iconFor } from "@/lib/catalog";
import { fromLocalParts, nowTimeHM, todayISO, toLocalParts } from "@/lib/format";


export function announceWarnings(w: Warnings | undefined, accountNames: Record<string, string>) {
  if (!w) return;
  if (w.available_negative) {
    toast.warning("Dana siap pakai jadi minus", {
      description: "Pengeluaran tetap tercatat. Alokasi tabunganmu tidak diubah otomatis.",
    });
  }
  const negatives = w.negative_accounts.map((id) => accountNames[id]).filter(Boolean);
  if (negatives.length) {
    toast.warning(`Saldo ${negatives.join(", ")} minus`, { description: "Cek lagi catatan transaksi di akun ini." });
  }
}

type Props = {
  initial?: Transaction;
  defaultType?: TxType;
  onClose: () => void;
};

export function TransactionModal({ initial, defaultType = "expense", onClose }: Props) {
  const editing = !!initial;
  const accountsQ = useAccounts(false);
  const categoriesQ = useCategories(false);

  const initialParts = initial ? toLocalParts(initial.occurred_at) : { date: todayISO(), time: nowTimeHM() };
  const [type, setType] = useState<TxType>(initial?.type ?? defaultType);
  const [amount, setAmount] = useState<number | null>(initial?.amount_idr ?? null);
  const [accountId, setAccountId] = useState(initial?.account.id ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category.id ?? "");
  const [date, setDate] = useState(initialParts.date);
  const [time, setTime] = useState(initialParts.time);
  const [note, setNote] = useState(initial?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const accounts = useMemo(() => {
    const list = accountsQ.data?.items ?? [];
    
    if (initial && !list.some((a) => a.id === initial.account.id)) {
      return [...list, { ...initial.account, balance_idr: 0 }];
    }
    return list;
  }, [accountsQ.data, initial]);

  const categories = useMemo(() => {
    const list = (categoriesQ.data ?? []).filter((c) => c.type === type);
    if (initial && initial.type === type && !list.some((c) => c.id === initial.category.id)) {
      return [...list, { ...initial.category, type, usage_count: 0, created_at: "" }];
    }
    return list;
  }, [categoriesQ.data, initial, type]);

  const effectiveAccount = accountId || (accounts.length === 1 ? accounts[0].id : "");
  const accountNames = Object.fromEntries((accountsQ.data?.items ?? []).map((a) => [a.id, a.name]));

  const save = useFinanceMutation((body: Record<string, unknown>) =>
    editing
      ? api<TxWriteResult>(`/transactions/${initial!.id}`, { method: "PATCH", body })
      : api<TxWriteResult>("/transactions", { method: "POST", body }),
  );
  const remove = useFinanceMutation(() => api<void>(`/transactions/${initial!.id}`, { method: "DELETE" }));

  function switchType(t: TxType) {
    setType(t);
    setCategoryId("");
    setErrors((e) => ({ ...e, category_id: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!amount || amount <= 0) e.amount_idr = "Masukkan nominal lebih dari 0.";
    if (!effectiveAccount) e.account_id = "Pilih akun.";
    if (!categoryId) e.category_id = "Pilih kategori.";
    if (!date) e.occurred_at = "Pilih tanggal.";
    else if (date > todayISO()) e.occurred_at = "Tanggal tidak boleh di masa depan.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError("");
    if (!validate()) return;
    try {
      const res = await save.mutateAsync({
        type,
        amount_idr: amount,
        account_id: effectiveAccount,
        category_id: categoryId,
        occurred_at: fromLocalParts(date, time),
        note: note.trim(),
      });
      toast.success(editing ? "Transaksi diperbarui" : type === "income" ? "Pemasukan tercatat" : "Pengeluaran tercatat");
      announceWarnings(res.warnings, accountNames);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Gagal menyimpan transaksi.");
    }
  }

  async function onDelete() {
    try {
      await remove.mutateAsync(undefined);
      toast.success("Transaksi dihapus", { description: "Saldo, budget, dan laporan sudah dihitung ulang." });
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setFormError(err instanceof ApiError ? err.message : "Gagal menghapus transaksi.");
    }
  }

  const loading = accountsQ.isPending || categoriesQ.isPending;
  const noAccounts = !loading && accounts.length === 0;

  return (
    <Modal title={editing ? "Edit transaksi" : "Catat transaksi"} onClose={onClose}>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-14" />
          <Skeleton className="h-24" />
        </div>
      ) : noAccounts ? (
        <EmptyState
          compact
          icon={Wallet}
          color="sky"
          title="Belum ada akun"
          description="Tambahkan akun cash, bank, atau e-wallet dulu supaya transaksi punya tempat."
          action={
            <LinkButton href="/accounts" onClick={onClose}>
              Tambah akun
            </LinkButton>
          }
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError && <ErrorNote message={formError} />}

          <Segmented
            label="Jenis transaksi"
            value={type}
            onChange={switchType}
            className="w-full"
            options={[
              { value: "expense", label: "Pengeluaran", icon: ArrowUpRight, tone: "text-expense-ink" },
              { value: "income", label: "Pemasukan", icon: ArrowDownLeft, tone: "text-income-ink" },
            ]}
          />

          <Field label="Nominal" error={errors.amount_idr}>
            {(p) => <MoneyInput {...p} size="lg" value={amount} onValueChange={setAmount} autoFocus={!editing} />}
          </Field>

          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-ink-soft">Kategori</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {categories.map((c) => {
                const Icon = iconFor(c.icon);
                const active = c.id === categoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategoryId(c.id)}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center transition active:scale-95",
                      active ? "border-primary bg-primary-tint/60 ring-2 ring-primary/20" : "border-line hover:border-line-strong hover:bg-sunken",
                    )}
                  >
                    <IconTile icon={Icon} color={c.color} size="sm" />
                    <span className="line-clamp-2 text-[12px] font-semibold leading-tight">{c.name}</span>
                  </button>
                );
              })}
            </div>
            {errors.category_id && <p className="mt-1.5 text-[13px] font-medium text-bad-ink">{errors.category_id}</p>}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-ink-soft">
              {type === "income" ? "Masuk ke akun" : "Dibayar dari akun"}
            </legend>
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => {
                const meta = accountMeta(a.type);
                const active = a.id === effectiveAccount;
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAccountId(a.id)}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold transition active:scale-95",
                      active ? "border-primary bg-primary-tint/60 ring-2 ring-primary/20" : "border-line hover:bg-sunken",
                    )}
                  >
                    <IconTile icon={meta.icon} color={meta.color} size="sm" className="!size-7 !rounded-full" />
                    {a.name}
                  </button>
                );
              })}
            </div>
            {errors.account_id && <p className="mt-1.5 text-[13px] font-medium text-bad-ink">{errors.account_id}</p>}
          </fieldset>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Tanggal" error={errors.occurred_at}>
              {(p) => <Input {...p} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <Field label="Jam (WIB)">
              {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />}
            </Field>
          </div>

          <Field label="Catatan" optional error={errors.note}>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                maxLength={280}
                placeholder={type === "income" ? "Contoh: gaji November" : "Contoh: makan siang bareng tim"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>

          <div className="flex items-center gap-2 pt-1">
            {editing && (
              <Button variant="ghost" icon={Trash} className="text-bad-ink hover:bg-bad-tint hover:text-bad-ink" onClick={() => setConfirmDelete(true)}>
                Hapus
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" loading={save.isPending}>
                {editing ? "Simpan perubahan" : "Simpan"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Hapus transaksi ini?"
          message="Transaksi akan dihapus dari catatan. Saldo, budget, dan laporan dihitung ulang otomatis."
          confirmLabel="Ya, hapus"
          loading={remove.isPending}
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}
