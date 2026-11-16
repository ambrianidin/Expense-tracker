"use client";

import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Archive, ArchiveArrowUp, Clock, Coins, KeyRound, Lock, Pencil, Plus, Tag, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Card, CardHeader, ErrorNote, IconTile, PageHeader, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api/client";
import { keys, useCategories, useFinanceMutation, useMe } from "@/lib/api/hooks";
import type { Category, ColorKey, TxType, User } from "@/lib/api/types";
import { CATEGORY_ICON_KEYS, iconFor } from "@/lib/catalog";
import { ColorPicker, IconPicker } from "@/features/savings/goal-forms";

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Profil, keamanan, dan kategori." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <ProfileCard />
          <PasswordCard />
          <PreferencesCard />
        </div>
        <CategoriesCard />
      </div>
    </div>
  );
}

function ProfileCard() {
  const me = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const value = name ?? me.data?.name ?? "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return setError("Nama wajib diisi.");
    setError("");
    setSaving(true);
    try {
      const { user } = await api<{ user: User }>("/auth/me", { method: "PATCH", body: { name: value.trim() } });
      qc.setQueryData(keys.me, user);
      setName(null);
      toast.success("Profil disimpan");
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.name ?? err.message) : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Profil" />
      <form onSubmit={onSubmit} className="space-y-4 px-5 pb-6 pt-4 sm:px-6" noValidate>
        <div className="flex items-center gap-3">
          <IconTile icon={UserIcon} color="butter" size="md" />
          <p className="min-w-0 truncate text-sm text-ink-soft">{me.data?.email}</p>
        </div>
        <Field label="Nama" error={error}>
          {(p) => <Input {...p} maxLength={80} value={value} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Button type="submit" size="sm" loading={saving} disabled={name === null || name === me.data?.name}>
          Simpan profil
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!current) fe.current_password = "Password lama wajib diisi.";
    if (next.length < 8) fe.new_password = "Password baru minimal 8 karakter.";
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setSaving(true);
    try {
      await api("/auth/change-password", { method: "POST", body: { current_password: current, new_password: next } });
      setCurrent("");
      setNext("");
      toast.success("Password diganti", { description: "Perangkat lain otomatis keluar." });
    } catch (err) {
      setErrors(err instanceof ApiError ? err.fields : {});
      if (!(err instanceof ApiError) || !Object.keys(err.fields).length) toast.error(err instanceof ApiError ? err.message : "Gagal mengganti password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Ganti password" />
      <form onSubmit={onSubmit} className="space-y-4 px-5 pb-6 pt-4 sm:px-6" noValidate>
        <Field label="Password lama" error={errors.current_password}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
        </Field>
        <Field label="Password baru" error={errors.new_password} hint="Minimal 8 karakter.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Button type="submit" size="sm" variant="secondary" icon={KeyRound} loading={saving}>
          Ganti password
        </Button>
      </form>
    </Card>
  );
}

function PreferencesCard() {
  return (
    <Card>
      <CardHeader title="Preferensi" subtitle="Ditetapkan untuk versi ini." />
      <ul className="space-y-2 px-5 pb-6 pt-4 sm:px-6">
        {[
          { icon: Coins, color: "mint", label: "Mata uang", value: "Rupiah (IDR)" },
          { icon: Clock, color: "sky", label: "Zona waktu", value: "Asia/Jakarta (WIB)" },
        ].map((p) => (
          <li key={p.label} className="flex items-center gap-3 rounded-2xl bg-sunken/60 px-3 py-2.5">
            <IconTile icon={p.icon} color={p.color} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted">{p.label}</p>
              <p className="text-sm font-semibold">{p.value}</p>
            </div>
            <Lock className="size-4 text-muted" aria-label="Terkunci" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CategoriesCard() {
  const [type, setType] = useState<TxType>("expense");
  const q = useCategories(true);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const toggle = useFinanceMutation((c: Category) => api<Category>(`/categories/${c.id}`, { method: "PATCH", body: { is_archived: !c.is_archived } }));
  const list = (q.data ?? []).filter((c) => c.type === type);
  const active = list.filter((c) => !c.is_archived);
  const archived = list.filter((c) => c.is_archived);

  async function onToggle(c: Category) {
    try {
      await toggle.mutateAsync(c);
      toast.success(c.is_archived ? `${c.name} dipulihkan` : `${c.name} diarsipkan`, {
        description: c.is_archived ? undefined : "Riwayat transaksinya tetap tersimpan dan dihitung.",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Gagal memperbarui kategori.");
    }
  }

  const row = (c: Category) => (
    <li key={c.id} className={clsx("flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-sunken/60", c.is_archived && "opacity-60")}>
      <IconTile icon={iconFor(c.icon)} color={c.color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{c.name}</p>
        <p className="text-[12px] text-muted">{c.usage_count} transaksi</p>
      </div>
      <IconButton icon={Pencil} label={`Edit ${c.name}`} size="sm" onClick={() => setEditing(c)} />
      <IconButton icon={c.is_archived ? ArchiveArrowUp : Archive} label={c.is_archived ? `Pulihkan ${c.name}` : `Arsipkan ${c.name}`} size="sm" onClick={() => onToggle(c)} />
    </li>
  );

  return (
    <Card className="self-start">
      <CardHeader
        title="Kategori"
        subtitle="Kategori yang sudah dipakai diarsipkan, bukan dihapus."
        action={
          <Button size="sm" variant="soft" icon={Plus} onClick={() => setEditing("new")}>
            Baru
          </Button>
        }
      />
      <div className="px-3 pb-5 pt-4 sm:px-4">
        <Segmented
          label="Tipe kategori"
          size="sm"
          className="mx-2 mb-3"
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "Pengeluaran" },
            { value: "income", label: "Pemasukan" },
          ]}
        />
        {q.isPending ? (
          <div className="space-y-2 px-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <>
            <ul>{active.map(row)}</ul>
            {archived.length > 0 && (
              <>
                <p className="mx-2 mb-1 mt-4 text-[12px] font-semibold uppercase tracking-wide text-muted">Diarsipkan</p>
                <ul>{archived.map(row)}</ul>
              </>
            )}
          </>
        )}
      </div>
      {editing && <CategoryModal initial={editing === "new" ? undefined : editing} defaultType={type} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function CategoryModal({ initial, defaultType, onClose }: { initial?: Category; defaultType: TxType; onClose: () => void }) {
  const editing = !!initial;
  const [type, setType] = useState<TxType>(initial?.type ?? defaultType);
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "tag");
  const [color, setColor] = useState<ColorKey>(initial?.color ?? "lavender");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const save = useFinanceMutation((body: Record<string, unknown>) =>
    editing ? api<Category>(`/categories/${initial!.id}`, { method: "PATCH", body }) : api<Category>("/categories", { method: "POST", body }),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: "Nama kategori wajib diisi." });
    setErrors({});
    setFormError("");
    try {
      await save.mutateAsync(editing ? { name: name.trim(), icon, color } : { name: name.trim(), type, icon, color });
      toast.success(editing ? "Kategori diperbarui" : "Kategori ditambahkan");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else setFormError("Gagal menyimpan kategori.");
    }
  }

  return (
    <Modal title={editing ? "Edit kategori" : "Kategori baru"} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && <ErrorNote message={formError} />}
        <div className="flex items-center gap-3 rounded-2xl bg-sunken/70 p-3">
          <IconTile icon={iconFor(icon)} color={color} size="lg" tilt />
          <p className="truncate font-bold">{name || "Nama kategori"}</p>
        </div>
        {!editing && (
          <Segmented
            label="Tipe kategori"
            value={type}
            onChange={setType}
            className="w-full"
            options={[
              { value: "expense", label: "Pengeluaran" },
              { value: "income", label: "Pemasukan" },
            ]}
          />
        )}
        <Field label="Nama" error={errors.name}>
          {(p) => <Input {...p} maxLength={40} placeholder="Contoh: Kopi" value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
        </Field>
        <Field label="Warna">{() => <ColorPicker value={color} onChange={setColor} />}</Field>
        <Field label="Ikon">{() => <IconPicker value={icon} onChange={setIcon} keys={CATEGORY_ICON_KEYS} color={color} />}</Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={save.isPending} icon={editing ? undefined : Tag}>
            Simpan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
