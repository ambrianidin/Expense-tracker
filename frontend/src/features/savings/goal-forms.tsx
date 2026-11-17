"use client";

import clsx from "clsx";
import { Check, CircleMinus, CirclePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Segmented, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ErrorNote, IconTile, Meter, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { useAllocations, useFinanceMutation } from "@/lib/api/hooks";
import type { ColorKey, Goal, Snapshot } from "@/lib/api/types";
import { COLORS, COLOR_LABEL, GOAL_ICON_KEYS, iconFor, tone } from "@/lib/catalog";
import { dateLabel, dayKey, rupiah, todayISO } from "@/lib/format";

export function IconPicker({ value, onChange, keys, color }: { value: string; onChange: (k: string) => void; keys: string[]; color: ColorKey }) {
  const t = tone(color);
  return (
    <div role="radiogroup" aria-label="Ikon" className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
      {keys.map((k) => {
        const Icon = iconFor(k);
        const active = k === value;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={k}
            onClick={() => onChange(k)}
            className={clsx("inline-flex aspect-square items-center justify-center rounded-xl transition active:scale-90", !active && "text-ink-soft hover:bg-sunken")}
            style={active ? { background: t.tint, color: t.ink, boxShadow: `inset 0 0 0 2px ${t.strong}` } : undefined}
          >
            <Icon className="size-[18px]" />
          </button>
        );
      })}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: ColorKey; onChange: (c: ColorKey) => void }) {
  return (
    <div role="radiogroup" aria-label="Warna" className="flex flex-wrap gap-2">
      {COLORS.map((c) => {
        const t = tone(c);
        const active = c === value;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={COLOR_LABEL[c]}
            title={COLOR_LABEL[c]}
            onClick={() => onChange(c)}
            className="inline-flex size-9 items-center justify-center rounded-full transition active:scale-90"
            style={{ background: t.tint, boxShadow: active ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${t.strong}` : `inset 0 0 0 1px ${t.strong}55` }}
          >
            {active && <Check className="size-4" style={{ color: t.ink }} strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

export function GoalModal({ initial, onClose }: { initial?: Goal; onClose: () => void }) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [target, setTarget] = useState<number | null>(initial?.target_amount_idr ?? null);
  const [date, setDate] = useState(initial?.target_date ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "piggy-bank");
  const [color, setColor] = useState<ColorKey>(initial?.color ?? "mint");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const save = useFinanceMutation((body: Record<string, unknown>) =>
    editing ? api<Goal>(`/savings-goals/${initial!.id}`, { method: "PATCH", body }) : api<Goal>("/savings-goals", { method: "POST", body }),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!title.trim()) fe.title = "Beri nama goal-mu.";
    if (!target) fe.target_amount_idr = "Target harus lebih dari 0.";
    else if (initial && target < initial.saved_idr) fe.target_amount_idr = `Target tidak boleh di bawah dana terkumpul (${rupiah(initial.saved_idr)}).`;
    setErrors(fe);
    setFormError("");
    if (Object.keys(fe).length) return;
    try {
      await save.mutateAsync({ title: title.trim(), target_amount_idr: target, target_date: date || null, icon, color });
      toast.success(editing ? "Goal diperbarui" : "Goal dibuat", { description: editing ? undefined : "Sekarang sisihkan dana pertamamu." });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Gagal menyimpan goal.");
    }
  }

  return (
    <Modal title={editing ? "Edit goal" : "Goal tabungan baru"} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && <ErrorNote message={formError} />}
        <div className="flex items-center gap-3 rounded-2xl bg-sunken/70 p-3">
          <IconTile icon={iconFor(icon)} color={color} size="lg" tilt />
          <div className="min-w-0">
            <p className="truncate font-bold">{title || "Nama goal"}</p>
            <p className="text-[13px] text-muted">{target ? `Target ${rupiah(target)}` : "Tentukan target"}</p>
          </div>
        </div>
        <Field label="Nama goal" error={errors.title}>
          {(p) => <Input {...p} placeholder="Contoh: Laptop baru" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!editing} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Target" error={errors.target_amount_idr}>
            {(p) => <MoneyInput {...p} value={target} onValueChange={setTarget} />}
          </Field>
          <Field label="Tenggat" optional error={errors.target_date}>
            {(p) => <Input {...p} type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <Field label="Warna">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
        <Field label="Ikon">{() => <IconPicker value={icon} onChange={setIcon} keys={GOAL_ICON_KEYS} color={color} />}</Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={save.isPending}>
            {editing ? "Simpan" : "Buat goal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type AllocationProps = { goal: Goal; summary?: Snapshot; defaultType?: "allocate" | "release"; onClose: () => void };


export function AllocationModal({ goal, summary, defaultType = "allocate", onClose }: AllocationProps) {
  const [type, setType] = useState<"allocate" | "release">(goal.saved_idr > 0 ? defaultType : "allocate");
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const t = tone(goal.color);

  const available = Math.max(0, summary?.available_to_spend_idr ?? 0);
  const maxAmount = type === "allocate" ? Math.min(available, goal.target_amount_idr - goal.saved_idr) : goal.saved_idr;

  const save = useFinanceMutation((body: Record<string, unknown>) =>
    api<{ goal: Goal; summary: Snapshot }>(`/savings-goals/${goal.id}/allocations`, { method: "POST", body }),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!amount) fe.amount_idr = "Masukkan nominal lebih dari 0.";
    else if (amount > maxAmount)
      fe.amount_idr = type === "allocate" ? `Maksimal ${rupiah(maxAmount)} untuk saat ini.` : `Dana di goal ini hanya ${rupiah(goal.saved_idr)}.`;
    setErrors(fe);
    setFormError("");
    if (Object.keys(fe).length) return;
    try {
      const res = await save.mutateAsync({ type, amount_idr: amount, note: note.trim() });
      if (type === "allocate" && res.goal.is_completed) {
        toast.success(`${goal.title} tercapai!`, { description: "Dana untuk goal ini sudah lengkap." });
      } else {
        toast.success(type === "allocate" ? `${rupiah(amount!)} disisihkan` : `${rupiah(amount!)} dilepas`, {
          description: type === "allocate" ? "Saldo akun tidak berubah, hanya ditandai untuk goal ini." : "Dana kembali ke saldo siap pakai.",
        });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Gagal menyimpan.");
    }
  }

  const quick = type === "allocate" ? [100_000, 250_000, 500_000].filter((v) => v <= maxAmount) : [];

  return (
    <Modal title={goal.title} description="Dana tetap di akunmu. Savena hanya menandai untuk goal ini." onClose={onClose} size="sm">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <ErrorNote message={formError} />}
        <div className="rounded-2xl p-4" style={{ background: t.tint }}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold" style={{ color: t.ink }}>
              Terkumpul
            </span>
            <span className="tnum font-bold text-ink">
              {rupiah(goal.saved_idr)} / {rupiah(goal.target_amount_idr)}
            </span>
          </div>
          <div className="mt-2">
            <Meter value={goal.progress_pct} color={t.strong} track="var(--color-surface)" label={`Progres ${goal.title}`} />
          </div>
        </div>
        <Segmented
          label="Jenis"
          value={type}
          onChange={(v) => {
            setType(v);
            setErrors({});
          }}
          className="w-full"
          options={[
            { value: "allocate", label: "Sisihkan", icon: CirclePlus },
            { value: "release", label: "Lepaskan", icon: CircleMinus },
          ]}
        />
        <Field
          label="Nominal"
          error={errors.amount_idr}
          hint={
            type === "allocate"
              ? `Bisa disisihkan maksimal ${rupiah(maxAmount)} (siap pakai ${rupiah(available)}).`
              : `Bisa dilepas maksimal ${rupiah(goal.saved_idr)}.`
          }
        >
          {(p) => <MoneyInput {...p} size="lg" value={amount} onValueChange={setAmount} autoFocus />}
        </Field>
        <div className="flex flex-wrap gap-2">
          {quick.map((v) => (
            <Button key={v} size="sm" variant="secondary" onClick={() => setAmount(v)} className="tnum">
              {rupiah(v)}
            </Button>
          ))}
          {maxAmount > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setAmount(maxAmount)}>
              {type === "allocate" ? "Maksimal" : "Semua"}
            </Button>
          )}
        </div>
        <Field label="Catatan" optional>
          {(p) => <Textarea {...p} rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={save.isPending} disabled={maxAmount <= 0}>
            {type === "allocate" ? "Sisihkan" : "Lepaskan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function HistoryModal({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const q = useAllocations(goal.id);
  return (
    <Modal title={`Riwayat ${goal.title}`} description="Catatan tidak bisa diedit. Koreksi dilakukan dengan transaksi kebalikannya." onClose={onClose} size="sm">
      {q.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : !q.data?.items.length ? (
        <p className="py-6 text-center text-sm text-muted">Belum ada dana yang disisihkan.</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <IconTile icon={a.type === "allocate" ? CirclePlus : CircleMinus} color={a.type === "allocate" ? "mint" : "sand"} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.type === "allocate" ? "Disisihkan" : "Dilepas"}</p>
                <p className="truncate text-[12px] text-muted">{[a.note, dateLabel(dayKey(a.occurred_at))].filter(Boolean).join(" · ")}</p>
              </div>
              <span className="tnum text-sm font-bold">
                {a.type === "allocate" ? "+" : "−"}
                {rupiah(a.amount_idr)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
