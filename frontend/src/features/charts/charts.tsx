"use client";

import clsx from "clsx";
import { useState } from "react";
import { IconTile } from "@/components/ui/misc";
import type { CategorySlice, MonthTotals } from "@/lib/api/types";
import { iconFor } from "@/lib/catalog";
import { compactRupiah, dateLabel, monthLabel, monthShort, pct, rupiah } from "@/lib/format";

export const SERIES = {
  income: { color: "var(--color-income)", label: "Pemasukan" },
  expense: { color: "var(--color-expense)", label: "Pengeluaran" },
} as const;


function niceScale(max: number, tickCount = 4) {
  if (max <= 0) return { max: 1, ticks: [0] };
  const rough = max / tickCount;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { max: top, ticks };
}





type CategoryBarsProps = {
  items: CategorySlice[];
  kind: "income" | "expense";
  limit?: number;
};

export function CategoryBars({ items, kind, limit = 6 }: CategoryBarsProps) {
  let rows = items;
  if (items.length > limit) {
    const rest = items.slice(limit - 1);
    rows = [
      ...items.slice(0, limit - 1),
      {
        category_id: "other",
        name: `Lainnya (${rest.length})`,
        icon: "shapes",
        color: "sand",
        amount_idr: rest.reduce((s, r) => s + r.amount_idr, 0),
        count: rest.reduce((s, r) => s + r.count, 0),
        pct: Math.round(rest.reduce((s, r) => s + r.pct, 0) * 100) / 100,
      },
    ];
  }
  const max = Math.max(...rows.map((r) => r.amount_idr), 1);
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.category_id} className="flex items-center gap-3">
          <IconTile icon={iconFor(r.icon)} color={r.color} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold">{r.name}</span>
              <span className="tnum shrink-0 text-sm font-bold">{rupiah(r.amount_idr)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2 flex-1">
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-500"
                  style={{ width: `${Math.max(2, (r.amount_idr / max) * 100)}%`, background: SERIES[kind].color }}
                />
              </div>
              <span className="tnum w-14 shrink-0 text-right text-[12px] font-medium text-muted">{pct(r.pct)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}





function Axis({ ticks, max }: { ticks: number[]; max: number }) {
  return (
    <>
      {ticks.map((t) => (
        <div key={t} className="pointer-events-none absolute inset-x-0" style={{ bottom: `${(t / max) * 100}%` }}>
          <div className={clsx("h-px", t === 0 ? "bg-line-strong" : "bg-line")} />
          <span className="tnum absolute -top-2 right-full mr-2 whitespace-nowrap text-[11px] text-muted">{compactRupiah(t)}</span>
        </div>
      ))}
    </>
  );
}

function Tooltip({ title, rows, left }: { title: string; rows: { label: string; value: number; color: string }[]; left: number }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute -top-2 z-10 w-max min-w-40 -translate-y-full rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-lift"
      style={{ left: `${left}%`, transform: `translate(-${left}%, -100%)` }}
    >
      <p className="mb-1.5 text-[12px] font-medium capitalize text-muted">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} aria-hidden />
          <span className="tnum text-sm font-bold">{rupiah(r.value)}</span>
          <span className="text-[12px] text-ink-soft">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
          <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}





export function TrendChart({ data, highlight }: { data: MonthTotals[]; highlight?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const { max, ticks } = niceScale(Math.max(...data.map((d) => Math.max(d.income_idr, d.expense_idr)), 0));
  return (
    <div className="pl-12">
      <div className="relative h-52" onPointerLeave={() => setActive(null)}>
        <Axis ticks={ticks} max={max} />
        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <button
              key={d.month}
              type="button"
              className="group relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-xl outline-none focus-visible:bg-primary-tint/40"
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${monthLabel(d.month)}: pemasukan ${rupiah(d.income_idr)}, pengeluaran ${rupiah(d.expense_idr)}`}
            >
              <span className={clsx("absolute inset-x-1 inset-y-0 rounded-xl transition", active === i && "bg-sunken/70")} aria-hidden />
              {(["income", "expense"] as const).map((k) => {
                const v = k === "income" ? d.income_idr : d.expense_idr;
                return (
                  <span
                    key={k}
                    className="relative w-full max-w-6 rounded-t-[4px] transition-[height,filter] duration-500 group-hover:brightness-105"
                    style={{ height: `${(v / max) * 100}%`, background: SERIES[k].color, minHeight: v > 0 ? 3 : 0 }}
                    aria-hidden
                  />
                );
              })}
            </button>
          ))}
        </div>
        {active !== null && (
          <Tooltip
            title={monthLabel(data[active].month)}
            left={((active + 0.5) / data.length) * 100}
            rows={[
              { label: "Pemasukan", value: data[active].income_idr, color: SERIES.income.color },
              { label: "Pengeluaran", value: data[active].expense_idr, color: SERIES.expense.color },
            ]}
          />
        )}
      </div>
      <div className="mt-2 flex">
        {data.map((d) => (
          <span
            key={d.month}
            className={clsx("flex-1 text-center text-[12px] capitalize", d.month === highlight ? "font-bold text-ink" : "text-muted")}
          >
            {monthShort(d.month)}
          </span>
        ))}
      </div>
    </div>
  );
}





export function DailyChart({ data }: { data: { date: string; expense_idr: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const { max, ticks } = niceScale(Math.max(...data.map((d) => d.expense_idr), 0), 3);
  return (
    <div className="pl-12">
      <div className="relative h-40" onPointerLeave={() => setActive(null)}>
        <Axis ticks={ticks} max={max} />
        <div className="absolute inset-0 flex gap-[2px]">
          {data.map((d, i) => (
            <button
              key={d.date}
              type="button"
              className="relative flex h-full flex-1 items-end justify-center outline-none"
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${dateLabel(d.date)}: pengeluaran ${rupiah(d.expense_idr)}`}
            >
              <span
                className={clsx("w-full max-w-6 rounded-t-[4px] transition-[height,opacity] duration-500", active !== null && active !== i && "opacity-55")}
                style={{ height: `${(d.expense_idr / max) * 100}%`, background: SERIES.expense.color, minHeight: d.expense_idr > 0 ? 3 : 0 }}
                aria-hidden
              />
            </button>
          ))}
        </div>
        {active !== null && (
          <Tooltip
            title={dateLabel(data[active].date, { weekday: "long", day: "numeric", month: "long" })}
            left={((active + 0.5) / data.length) * 100}
            rows={[{ label: "Pengeluaran", value: data[active].expense_idr, color: SERIES.expense.color }]}
          />
        )}
      </div>
      <div className="relative mt-2 h-4">
        {data.map((d, i) => {
          const day = Number(d.date.slice(8));
          if (day !== 1 && day % 5 !== 0) return null;
          return (
            <span
              key={d.date}
              className="tnum absolute -translate-x-1/2 text-[11px] text-muted"
              style={{ left: `${((i + 0.5) / data.length) * 100}%` }}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}





export function TrendTable({ data }: { data: MonthTotals[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-muted">
            <th className="py-2 font-semibold">Bulan</th>
            <th className="py-2 text-right font-semibold">Pemasukan</th>
            <th className="py-2 text-right font-semibold">Pengeluaran</th>
            <th className="py-2 text-right font-semibold">Selisih</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {data.map((d) => (
            <tr key={d.month} className="border-b border-line/60 last:border-0">
              <td className="py-2.5 capitalize">{monthLabel(d.month)}</td>
              <td className="py-2.5 text-right">{rupiah(d.income_idr)}</td>
              <td className="py-2.5 text-right">{rupiah(d.expense_idr)}</td>
              <td className={clsx("py-2.5 text-right font-semibold", d.net_idr < 0 && "text-bad-ink")}>{rupiah(d.net_idr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DailyTable({ data }: { data: { date: string; expense_idr: number }[] }) {
  const rows = data.filter((d) => d.expense_idr > 0);
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">Belum ada pengeluaran di bulan ini.</p>;
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-[12px] text-muted">
            <th className="py-2 font-semibold">Tanggal</th>
            <th className="py-2 text-right font-semibold">Pengeluaran</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {rows.map((d) => (
            <tr key={d.date} className="border-b border-line/60 last:border-0">
              <td className="py-2.5">{dateLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}</td>
              <td className="py-2.5 text-right">{rupiah(d.expense_idr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
