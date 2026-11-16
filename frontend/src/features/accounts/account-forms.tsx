"use client";

import clsx from "clsx";
import { ArrowDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/field";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { ErrorNote, IconTile } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { useAccounts, useFinanceMutation, type TransferWriteResult } from "@/lib/api/hooks";
import type { Account, AccountType } from "@/lib/api/types";
import { ACCOUNT_TYPES } from "@/lib/catalog";
import { fromLocalParts, nowTimeHM, rupiah, todayISO } from "@/lib/format";
import { announceWarnings } from "@/features/transactions/transaction-form";

export function AccountTypePicker({ value, onChange }: { value: AccountType; onChange: (t: AccountType) => void }) {
  return (
    <div role="radiogroup" aria-label="Jenis akun" className="grid grid-cols-3 gap-2">
      {ACCOUNT_TYPES.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(t.value)}
            className={clsx(
              "flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition active:scale-95",
              active ? "border-primary bg-primary-tint/60 ring-2 ring-primary/20" : "border-line hover:bg-sunken",
            )}
          >
            <IconTile icon={t.icon} color={t.color} size="md" tilt={active} />
            <span className="text-[13px] font-bold">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type AccountFormProps = { initial?: Account; onClose: () => void; onSaved?: (a: Account) => void };

export function AccountModal({ initial, onClose, onSaved }: AccountFormProps) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<AccountType>(initial?.type ?? "bank");
  const [opening, setOpening] = useState<number | null>(initial?.opening_balance_idr ?? null);
  const [openingDate, setOpeningDate] = useState(initial?.opening_date ?? todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const save = useFinanceMutation((body: Record<string, unknown>) =>
    editing ? api<Account>(`/accounts/${initial!.id}`, { method: "PATCH", body }) : api<Account>("/accounts", { method: "POST", body }),
  );

  async function submit(confirm = false) {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Nama akun wajib diisi.";
    setErrors(e);
    setFormError("");
    if (Object.keys(e).length) return;
    try {
      const account = await save.mutateAsync({
        name: name.trim(),
        type,
        opening_balance_idr: opening ?? 0,
        opening_date: openingDate,
        ...(editing && confirm ? { confirm_recalculate: true } : {}),
      });
      toast.success(editing ? "Akun diperbarui" : "Akun ditambahkan");
      onSaved?.(account);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "confirmation_required") {
        setNeedsConfirm(true);
        return;
      }
      setNeedsConfirm(false);
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Gagal menyimpan akun.");
    }
  }

  return (
    <Modal title={editing ? "Edit akun" : "Tambah akun"} description={editing ? undefined : "Saldo awal adalah uang yang sudah ada di akun ini, bukan pemasukan."} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
        className="space-y-5"
      >
        {formError && <ErrorNote message={formError} />}
        <AccountTypePicker value={type} onChange={setType} />
        <Field label="Nama akun" error={errors.name}>
          {(p) => <Input {...p} placeholder="Contoh: BCA, GoPay, Dompet" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!editing} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Saldo awal" error={errors.opening_balance_idr}>
            {(p) => <MoneyInput {...p} value={opening} onValueChange={setOpening} />}
          </Field>
          <Field label="Per tanggal" error={errors.opening_date}>
            {(p) => <Input {...p} type="date" max={todayISO()} value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />}
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={save.isPending && !needsConfirm}>
            {editing ? "Simpan" : "Tambah akun"}
          </Button>
        </div>
      </form>

      {needsConfirm && (
        <ConfirmDialog
          title="Ubah saldo awal?"
          tone="primary"
          message={
            <>
              Akun <b className="text-ink">{name}</b> sudah punya transaksi. Mengubah saldo awal dari{" "}
              <b className="text-ink">{rupiah(initial?.opening_balance_idr ?? 0)}</b> menjadi <b className="text-ink">{rupiah(opening ?? 0)}</b> akan
              menghitung ulang saldo akun dan total saldomu.
            </>
          }
          confirmLabel="Ya, hitung ulang"
          loading={save.isPending}
          onConfirm={() => submit(true)}
          onClose={() => setNeedsConfirm(false)}
        />
      )}
    </Modal>
  );
}

export function TransferModal({ onClose, defaultFrom }: { onClose: () => void; defaultFrom?: string }) {
  const accountsQ = useAccounts(false);
  const accounts = accountsQ.data?.items ?? [];
  const [from, setFrom] = useState(defaultFrom ?? "");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const save = useFinanceMutation((body: Record<string, unknown>) => api<TransferWriteResult>("/transfers", { method: "POST", body }));
  const fromAccount = accounts.find((a) => a.id === from);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!from) fe.from_account_id = "Pilih akun asal.";
    if (!to) fe.to_account_id = "Pilih akun tujuan.";
    else if (to === from) fe.to_account_id = "Akun tujuan harus berbeda.";
    if (!amount) fe.amount_idr = "Masukkan nominal lebih dari 0.";
    setErrors(fe);
    setFormError("");
    if (Object.keys(fe).length) return;
    try {
      const res = await save.mutateAsync({
        from_account_id: from,
        to_account_id: to,
        amount_idr: amount,
        occurred_at: fromLocalParts(date, date === todayISO() ? nowTimeHM() : "12:00"),
        note: note.trim(),
      });
      toast.success("Transfer tercatat", { description: "Total saldo tetap sama, hanya pindah akun." });
      announceWarnings(res.warnings, Object.fromEntries(accounts.map((a) => [a.id, a.name])));
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Gagal mencatat transfer.");
    }
  }

  return (
    <Modal title="Transfer antar akun" description="Pindahkan catatan uang antar akunmu sendiri. Bukan pemasukan atau pengeluaran." onClose={onClose}>
      {accounts.length < 2 && !accountsQ.isPending ? (
        <p className="rounded-2xl bg-sunken px-4 py-6 text-center text-sm text-ink-soft">Kamu butuh minimal dua akun aktif untuk transfer.</p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <ErrorNote message={formError} />}
          <Field label="Dari akun" error={errors.from_account_id} hint={fromAccount ? `Saldo sekarang ${rupiah(fromAccount.balance_idr)}` : undefined}>
            {(p) => (
              <Select {...p} value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Pilih akun asal</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex justify-center">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary-tint text-primary-ink">
              <ArrowDown className="size-4" />
            </span>
          </div>
          <Field label="Ke akun" error={errors.to_account_id}>
            {(p) => (
              <Select {...p} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Pilih akun tujuan</option>
                {accounts
                  .filter((a) => a.id !== from)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Nominal" error={errors.amount_idr}>
              {(p) => <MoneyInput {...p} value={amount} onValueChange={setAmount} />}
            </Field>
            <Field label="Tanggal" error={errors.occurred_at}>
              {(p) => <Input {...p} type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
          </div>
          <Field label="Catatan" optional error={errors.note}>
            {(p) => <Textarea {...p} rows={2} maxLength={280} placeholder="Contoh: top up e-wallet" value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" loading={save.isPending}>
              Simpan transfer
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
