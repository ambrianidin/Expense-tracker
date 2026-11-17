"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ErrorNote } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { useFinanceMutation } from "@/lib/api/hooks";
import type { BillReminder, BillReminderInput } from "@/lib/api/types";
import { todayISO } from "@/lib/format";

export function ReminderForm({ initial, onClose }: { initial?: BillReminder; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState<number | null>(initial?.amount_idr ?? null);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? todayISO());
  const [days, setDays] = useState(initial?.remind_days_before ?? 3);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const save = useFinanceMutation((body: BillReminderInput) => api<BillReminder>(initial ? `/bill-reminders/${initial.id}` : "/bill-reminders", { method: initial ? "PATCH" : "POST", body }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErrors({}); setError("");
    try {
      await save.mutateAsync({ title: title.trim(), amount_idr: amount, due_date: dueDate, remind_days_before: days });
      toast.success(initial ? "Pengingat diperbarui" : "Pengingat tagihan dibuat");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setError(err.message); }
      else setError("Pengingat belum tersimpan. Coba lagi.");
    }
  }

  return <Modal title={initial ? "Ubah pengingat" : "Tambah pengingat tagihan"} description="Pengingat sekali untuk tanggal yang kamu pilih. Tidak mencatat transaksi otomatis." onClose={onClose}>
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <ErrorNote message={error} />}
      <Field label="Nama tagihan" error={errors.title}>{p => <Input {...p} autoFocus maxLength={80} placeholder="Contoh: Internet rumah" value={title} onChange={e => setTitle(e.target.value)} />}</Field>
      <Field label="Nominal" optional error={errors.amount_idr}>{p => <MoneyInput {...p} value={amount} onValueChange={setAmount} />}</Field>
      <Field label="Jatuh tempo (WIB)" error={errors.due_date}>{p => <Input {...p} type="date" min="2000-01-01" max="2100-12-31" value={dueDate} onChange={e => setDueDate(e.target.value)} />}</Field>
      <Field label="Mulai ingatkan" error={errors.remind_days_before} hint="Pengingat muncul di pusat notifikasi saat aplikasi dibuka.">{p => <Select {...p} value={days} onChange={e => setDays(Number(e.target.value))}>{[0, 1, 3, 7, 14, 30].map(day => <option key={day} value={day}>{day === 0 ? "Pada hari jatuh tempo" : `${day} hari sebelumnya`}</option>)}</Select>}</Field>
      <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Batal</Button><Button type="submit" loading={save.isPending}>Simpan pengingat</Button></div>
    </form>
  </Modal>;
}
