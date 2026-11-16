"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Lock, Mail, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { keys, useMe } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";


function nextPath(): string {
  if (typeof window === "undefined") return "/dashboard";
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}



function useRedirectIfSignedIn(submitting: boolean) {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    if (me.data && !submitting) router.replace("/dashboard");
  }, [me.data, submitting, router]);
}

function IconInput({ icon: Icon, ...props }: React.ComponentProps<typeof Input> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
      <Input {...props} className="h-12 pl-11" />
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
      <Input {...props} type={show ? "text" : "password"} className="h-12 pl-11 pr-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
        className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
      >
        {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  useRedirectIfSignedIn(loading);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!email.trim()) fe.email = "Email wajib diisi.";
    if (!password) fe.password = "Password wajib diisi.";
    setErrors(fe);
    setFormError("");
    if (Object.keys(fe).length) return;
    setLoading(true);
    try {
      const { user } = await api<{ user: User }>("/auth/login", { method: "POST", body: { email, password } });
      qc.setQueryData(keys.me, user);
      router.replace(nextPath());
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(Object.keys(err.fields).length ? "" : err.message);
      } else setFormError("Gagal masuk. Coba lagi.");
      setLoading(false);
    }
  }

  return (
    <div className="animate-pop-in">
      <h1 className="text-[28px] font-extrabold tracking-tight">Halo lagi!</h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">Masuk untuk melihat ringkasan keuanganmu.</p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
        {formError && <ErrorNote message={formError} />}
        <Field label="Email" error={errors.email}>
          {(p) => (
            <IconInput {...p} icon={Mail} type="email" autoComplete="email" placeholder="kamu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" placeholder="Password kamu" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" block loading={loading} className="!mt-6">
          Masuk
          {!loading && <ArrowRight className="size-[18px]" />}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Belum punya akun?{" "}
        <Link href="/register" className="font-bold text-primary-ink hover:underline">
          Daftar gratis
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  useRedirectIfSignedIn(loading);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!name.trim()) fe.name = "Nama wajib diisi.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = "Format email tidak valid.";
    if (password.length < 8) fe.password = "Password minimal 8 karakter.";
    setErrors(fe);
    setFormError("");
    if (Object.keys(fe).length) return;
    setLoading(true);
    try {
      const { user } = await api<{ user: User }>("/auth/register", { method: "POST", body: { name, email, password } });
      qc.setQueryData(keys.me, user);
      router.replace("/onboarding");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(Object.keys(err.fields).length ? "" : err.message);
      } else setFormError("Gagal mendaftar. Coba lagi.");
      setLoading(false);
    }
  }

  return (
    <div className="animate-pop-in">
      <h1 className="text-[28px] font-extrabold tracking-tight">Mulai rapikan uangmu</h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">Buat akun Budgetly dalam satu menit.</p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
        {formError && <ErrorNote message={formError} />}
        <Field label="Nama panggilan" error={errors.name}>
          {(p) => <IconInput {...p} icon={UserIcon} autoComplete="given-name" placeholder="Nama kamu" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => (
            <IconInput {...p} icon={Mail} type="email" autoComplete="email" placeholder="kamu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Password" error={errors.password} hint="Minimal 8 karakter.">
          {(p) => <PasswordInput {...p} autoComplete="new-password" placeholder="Buat password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" block loading={loading} className="!mt-6">
          Buat akun
          {!loading && <ArrowRight className="size-[18px]" />}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-bold text-primary-ink hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
