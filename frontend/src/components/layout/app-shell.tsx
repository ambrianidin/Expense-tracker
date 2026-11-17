"use client";

import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Bell,
  ChartColumn,
  ChartPie,
  LayoutDashboard,
  LogOut,
  Menu,
  PiggyBank,
  Plus,
  ReceiptText,
  Settings,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, UNAUTHORIZED_EVENT, api } from "@/lib/api/client";
import { useMe, useNotifications } from "@/lib/api/hooks";
import type { Transaction, TxType } from "@/lib/api/types";
import { TransactionModal } from "@/features/transactions/transaction-form";
import { Logo } from "./logo";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Beranda", icon: LayoutDashboard },
  { href: "/transactions", label: "Transaksi", icon: ReceiptText },
  { href: "/accounts", label: "Akun", icon: Wallet },
  { href: "/budgets", label: "Budget", icon: ChartPie },
  { href: "/savings", label: "Tabungan", icon: PiggyBank },
  { href: "/reports", label: "Laporan", icon: ChartColumn },
  { href: "/notifications", label: "Notifikasi", icon: Bell },
  { href: "/settings", label: "Pengaturan", icon: Settings },
];

const MOBILE_PRIMARY = ["/dashboard", "/transactions", "/savings"];

type QuickAdd = { open: (opts?: { type?: TxType; edit?: Transaction }) => void };
const QuickAddContext = createContext<QuickAdd>({ open: () => {} });
export const useQuickAdd = () => useContext(QuickAddContext);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const notifications = useNotifications(false, 1, !!me.data);
  const unreadCount = notifications.data?.unread_count ?? 0;
  const [quick, setQuick] = useState<{ type?: TxType; edit?: Transaction } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const toLogin = useCallback(() => {
    qc.clear();
    router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [qc, router, pathname]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, toLogin);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, toLogin);
  }, [toLogin]);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) toLogin();
  }, [me.error, toLogin]);

  
  useLayoutEffect(() => () => setMenuOpen(false), []);

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      qc.clear();
      router.replace("/login");
    }
  }

  const open = useCallback((opts?: { type?: TxType; edit?: Transaction }) => setQuick(opts ?? {}), []);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  
  
  const user = me.data;
  const offline = me.isError && !(me.error instanceof ApiError && me.error.status === 401);

  return (
    <QuickAddContext.Provider value={{ open }}>
      <div className="min-h-dvh lg:pl-[264px]">
        
        <aside className="fixed inset-y-0 left-0 hidden w-[264px] flex-col border-r border-line bg-canvas px-4 py-6 lg:flex">
          <Link href="/dashboard" className="px-2">
            <Logo />
          </Link>
          <Button className="mx-1 mt-7" icon={Plus} onClick={() => open()}>
            Catat transaksi
          </Button>
          <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" aria-label="Navigasi utama">
            {NAV.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} badge={item.href === "/notifications" ? unreadCount : 0} />
            ))}
          </nav>
          <div className="mt-4 flex shrink-0 items-center gap-3 rounded-3xl border border-line bg-surface p-3">
            <Avatar name={user?.name ?? ""} />
            <div className="min-w-0 flex-1">
              {user ? (
                <>
                  <p className="truncate text-sm font-bold">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </>
              ) : (
                <div className="space-y-1.5" aria-hidden>
                  <div className="h-3 w-24 animate-pulse rounded-full bg-sunken" />
                  <div className="h-2.5 w-32 animate-pulse rounded-full bg-sunken" />
                </div>
              )}
            </div>
            <button
              onClick={logout}
              aria-label="Keluar"
              title="Keluar"
              className="inline-flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </aside>

        
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line/70 bg-canvas/85 px-4 backdrop-blur-md lg:hidden">
          <Link href="/dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/notifications" aria-label={unreadCount ? `Notifikasi, ${unreadCount} belum dibaca` : "Notifikasi"} className="relative inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-sunken">
              <Bell className="size-5" aria-hidden />
              {unreadCount > 0 && <span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </Link>
            <Link href="/settings" aria-label="Pengaturan profil"><Avatar name={user?.name ?? ""} /></Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          {offline && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-bad-tint px-4 py-3 text-sm text-bad-ink" role="alert">
              <span className="font-medium">Tidak dapat terhubung ke server.</span>
              <button className="font-semibold hover:underline" onClick={() => me.refetch()}>
                Coba lagi
              </button>
            </div>
          )}
          {children}
        </main>

        
        <nav
          aria-label="Navigasi utama"
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-[26px] border border-line bg-surface/95 px-2 py-2 shadow-lift backdrop-blur-md lg:hidden"
        >
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href))
            .slice(0, 2)
            .map((item) => (
              <BottomLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          <button
            onClick={() => open()}
            aria-label="Catat transaksi"
            className="-mt-7 inline-flex size-14 items-center justify-center rounded-[20px] bg-primary text-white shadow-[0_10px_22px_-8px_rgb(106_92_235/0.7)] transition active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </button>
          <BottomLink item={NAV.find((n) => n.href === "/savings")!} active={isActive("/savings")} />
          <button
            onClick={() => setMenuOpen(true)}
            className={clsx(
              "flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1 text-[11px] font-semibold transition",
              ["/accounts", "/budgets", "/reports", "/settings", "/notifications"].some(isActive) ? "text-primary-ink" : "text-muted",
            )}
          >
            <Menu className="size-5" />
            Lainnya
          </button>
        </nav>

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu lainnya">
            <button className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] animate-fade-in" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} />
            <div className="absolute inset-x-3 bottom-3 rounded-[28px] bg-surface p-4 shadow-lift animate-sheet-in">
              <div className="mb-2 flex items-center justify-between px-2">
                <p className="text-sm font-bold">Menu</p>
                <button onClick={() => setMenuOpen(false)} aria-label="Tutup" className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-sunken">
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href)).map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                        isActive(item.href) ? "border-primary/30 bg-primary-tint text-primary-ink" : "border-line hover:bg-sunken",
                      )}
                    >
                      <Icon className="size-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              <button
                onClick={logout}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-bad-ink hover:bg-bad-tint"
              >
                <LogOut className="size-4" />
                Keluar
              </button>
            </div>
          </div>
        )}

        {quick && <TransactionModal initial={quick.edit} defaultType={quick.type} onClose={() => setQuick(null)} />}
      </div>
    </QuickAddContext.Provider>
  );
}

function NavLink({ item, active, badge = 0 }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition",
        active ? "bg-surface text-ink shadow-soft" : "text-ink-soft hover:bg-surface/70 hover:text-ink",
      )}
    >
      <span
        className={clsx(
          "inline-flex size-8 items-center justify-center rounded-xl transition",
          active ? "bg-primary-tint text-primary-ink" : "text-muted group-hover:text-ink",
        )}
      >
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      {item.label}
      {badge > 0 && <span className="ml-auto rounded-full bg-primary px-2 text-[11px] font-bold leading-5 text-white" aria-label={`${badge} belum dibaca`}>{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1 text-[11px] font-semibold transition",
        active ? "text-primary-ink" : "text-muted",
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
      {item.label}
    </Link>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--butter-tint)] text-[13px] font-bold text-[var(--butter-ink)]">
      {initials}
    </span>
  );
}
