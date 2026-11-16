"use client";

import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleExclamationPoint,
  TriangleExclamationPoint,
  type LucideIcon,
} from "lucide-react";
import type { BudgetStatus, ColorKey } from "@/lib/api/types";
import { tone } from "@/lib/catalog";
import { monthLabel, shiftMonth } from "@/lib/format";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-[28px] border border-line bg-surface shadow-soft", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type IconTileProps = { icon: LucideIcon; color: ColorKey | string; size?: "sm" | "md" | "lg"; tilt?: boolean; className?: string };


export function IconTile({ icon: Icon, color, size = "md", tilt, className }: IconTileProps) {
  const t = tone(color);
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center",
        size === "sm" && "size-9 rounded-xl",
        size === "md" && "size-11 rounded-2xl",
        size === "lg" && "size-14 rounded-[20px]",
        tilt && "-rotate-6",
        className,
      )}
      style={{ background: t.tint, color: t.ink }}
      aria-hidden
    >
      <Icon className={clsx(size === "sm" ? "size-[18px]" : size === "md" ? "size-5" : "size-6")} strokeWidth={2.1} />
    </span>
  );
}

type MeterProps = { value: number; color?: string; track?: string; label: string; size?: "sm" | "md" };


export function Meter({ value, color = "var(--color-primary)", track = "var(--color-primary-tint)", label, size = "md" }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={clsx("w-full overflow-hidden rounded-full", size === "sm" ? "h-2" : "h-2.5")}
      style={{ background: track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${clamped}%`, background: color, minWidth: value > 0 ? 8 : 0 }}
      />
    </div>
  );
}

export const budgetTone: Record<BudgetStatus, { fill: string; track: string; ink: string; tint: string }> = {
  safe: { fill: "var(--color-good)", track: "var(--color-good-tint)", ink: "var(--color-good-ink)", tint: "var(--color-good-tint)" },
  warning: { fill: "var(--color-warn)", track: "var(--color-warn-tint)", ink: "var(--color-warn-ink)", tint: "var(--color-warn-tint)" },
  over: { fill: "var(--color-bad)", track: "var(--color-bad-tint)", ink: "var(--color-bad-ink)", tint: "var(--color-bad-tint)" },
};


export function BudgetBadge({ status, usage }: { status: BudgetStatus; usage: number }) {
  const t = budgetTone[status];
  const Icon = status === "safe" ? CircleCheck : status === "warning" ? TriangleExclamationPoint : CircleExclamationPoint;
  const label = status === "safe" ? "Aman" : status === "warning" ? "Hampir habis" : usage > 100 ? "Melebihi budget" : "Limit tercapai";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: t.tint, color: t.ink }}
    >
      <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
      {label}
    </span>
  );
}

export function Badge({ children, color = "lavender", icon: Icon }: { children: React.ReactNode; color?: ColorKey | string; icon?: LucideIcon }) {
  const t = tone(color);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: t.tint, color: t.ink }}
    >
      {Icon && <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-2xl bg-sunken", className)} aria-hidden />;
}


export function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat halaman">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 rounded-full" />
          <Skeleton className="h-4 w-72 rounded-full" />
        </div>
        <Skeleton className="h-10 w-48 rounded-full max-sm:hidden" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-[28px]" />
        <Skeleton className="h-28 rounded-[28px]" />
        <Skeleton className="h-28 rounded-[28px]" />
      </div>
      <Skeleton className="h-72 rounded-[28px]" />
    </div>
  );
}

type EmptyProps = { icon: LucideIcon; color?: ColorKey; title: string; description?: React.ReactNode; action?: React.ReactNode; compact?: boolean };

export function EmptyState({ icon: Icon, color = "lavender", title, description, action, compact }: EmptyProps) {
  const t = tone(color);
  return (
    <div className={clsx("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14")}>
      <div className="relative mb-4">
        <span className="absolute -left-3 -top-1 size-2.5 rounded-full" style={{ background: t.strong, opacity: 0.35 }} />
        <span className="absolute -right-2 top-6 size-1.5 rounded-full" style={{ background: t.strong, opacity: 0.5 }} />
        <span
          className={clsx("inline-flex rotate-6 items-center justify-center rounded-[24px]", compact ? "size-14" : "size-[72px]")}
          style={{ background: t.tint, color: t.ink }}
        >
          <Icon className={compact ? "size-6" : "size-8"} strokeWidth={1.9} aria-hidden />
        </span>
      </div>
      <p className="text-[15px] font-bold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type MonthPickerProps = { value: string; onChange: (m: string) => void; max?: string; className?: string };

export function MonthPicker({ value, onChange, max, className }: MonthPickerProps) {
  const atMax = !!max && value >= max;
  return (
    <div className={clsx("inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-soft", className)}>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, -1))}
        aria-label="Bulan sebelumnya"
        className="inline-flex size-8 items-center justify-center rounded-full text-ink-soft transition hover:bg-sunken hover:text-ink"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-32 text-center text-sm font-semibold capitalize" aria-live="polite">
        {monthLabel(value)}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(value, 1))}
        disabled={atMax}
        aria-label="Bulan berikutnya"
        className="inline-flex size-8 items-center justify-center rounded-full text-ink-soft transition hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-bad-tint px-4 py-3 text-sm text-bad-ink" role="alert">
      <span className="flex items-center gap-2 font-medium">
        <CircleExclamationPoint className="size-4 shrink-0" />
        {message}
      </span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline-offset-2 hover:underline">
          Coba lagi
        </button>
      )}
    </div>
  );
}
