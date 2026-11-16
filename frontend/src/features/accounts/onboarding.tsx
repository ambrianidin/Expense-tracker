"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput } from "@/components/ui/field";
import { Card, ErrorNote, IconTile } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { useFinanceMutation, useMe } from "@/lib/api/hooks";
import type { Account, AccountType } from "@/lib/api/types";
import { firstName } from "@/lib/format";
import { AccountTypePicker } from "./account-forms";

const PLACEHOLDER: Record<AccountType, string> = { bank: "Contoh: BCA", ewallet: "Contoh: GoPay", cash: "Contoh: Dompet" };


export function Onboarding() {
  const me = useMe();
  const router = useRouter();
  const [type, setType] = useState<AccountType>("bank");
  const [name, setName] = useState("");
  const [opening, setOpening] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const save = useFinanceMutation((body: Record<string, unknown>) => api<Account>("/accounts", { method: "POST", body }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrors({ name: "Beri nama akunnya dulu." });
      return;
    }
    setErrors({});
    setFormError("");
    try {
      await save.mutateAsync({ name: name.trim(), type, opening_balance_idr: opening ?? 0 });
      toast.success("Akun pertama siap", { description: "Sekarang kamu bisa mulai mencatat transaksi." });
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Gagal menyimpan akun.");
    }
  }

  return (
    <div className="mx-auto max-w-lg py-4">
      <div className="mb-6 flex items-center gap-3.5">
        <IconTile icon={Sparkles} color="butter" size="lg" tilt />
        <div>
          <p className="text-sm font-semibold text-primary-ink">Langkah 1 dari 1</p>
          <h1 className="text-2xl font-extrabold tracking-tight">Selamat datang, {firstName(me.data?.name ?? "")}!</h1>
        </div>
      </div>
      <Card className="p-6 sm:p-7">
        <h2 className="text-lg font-bold">Di mana uangmu disimpan?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Tambahkan satu akun dulu beserta saldo yang ada sekarang. Akun lain bisa ditambah nanti.
        </p>
        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
          {formError && <ErrorNote message={formError} />}
          <AccountTypePicker value={type} onChange={setType} />
          <Field label="Nama akun" error={errors.name}>
            {(p) => <Input {...p} placeholder={PLACEHOLDER[type]} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Saldo saat ini" error={errors.opening_balance_idr} hint="Saldo awal tidak dihitung sebagai pemasukan.">
            {(p) => <MoneyInput {...p} size="lg" value={opening} onValueChange={setOpening} />}
          </Field>
          <Button type="submit" size="lg" block loading={save.isPending}>
            Simpan dan lanjut
            {!save.isPending && <ArrowRight className="size-[18px]" />}
          </Button>
        </form>
      </Card>
      <p className="mt-5 text-center text-sm">
        <Link href="/dashboard" className="font-semibold text-ink-soft hover:text-ink">
          Lewati dulu
        </Link>
      </p>
    </div>
  );
}
