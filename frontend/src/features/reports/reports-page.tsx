"use client";

import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChartColumn, ChartNoAxesColumn, PiggyBank, Scale, Table2, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Segmented } from "@/components/ui/field";
import { Card, CardHeader, EmptyState, ErrorNote, IconTile, MonthPicker, PageHeader, Skeleton } from "@/components/ui/misc";
import { CategoryBars, DailyChart, DailyTable, Legend, SERIES, TrendChart, TrendTable } from "@/features/charts/charts";
import { useReport } from "@/lib/api/hooks";
import { currentMonth, monthLabel, monthShort, pct, rupiah } from "@/lib/format";

type View = "chart" | "table";

function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <Segmented
      label="Tampilan"
      size="sm"
      value={value}
      onChange={onChange}
      options={[
        { value: "chart", label: "Grafik", icon: ChartNoAxesColumn },
        { value: "table", label: "Tabel", icon: Table2 },
      ]}
    />
  );
}

export function ReportsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [trendView, setTrendView] = useState<View>("chart");
  const [dailyView, setDailyView] = useState<View>("chart");
  const q = useReport(month);
  const r = q.data;

  return (
    <div>
      <PageHeader title="Laporan" subtitle="Ringkasan arus kas bulananmu." actions={<MonthPicker value={month} onChange={setMonth} max={currentMonth()} />} />

      {q.isError && <ErrorNote message={q.error.message} onRetry={() => q.refetch()} />}

      {!r ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-[28px]" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-[28px]" />
        </div>
      ) : (
        <div className={clsx("space-y-4 transition-opacity", q.isPlaceholderData && "opacity-60")}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile icon={ArrowDownLeft} color="sky" label="Pemasukan" value={rupiah(r.income_idr)} delta={{ cur: r.income_idr, prev: r.previous.income_idr, upIsGood: true, month: r.previous.month }} />
            <Tile icon={ArrowUpRight} color="peach" label="Pengeluaran" value={rupiah(r.expense_idr)} delta={{ cur: r.expense_idr, prev: r.previous.expense_idr, upIsGood: false, month: r.previous.month }} />
            <Tile icon={Scale} color="lavender" label="Selisih" value={rupiah(r.net_idr)} negative={r.net_idr < 0} sub={r.savings_rate_pct !== null ? `${pct(r.savings_rate_pct)} dari pemasukan` : "Belum ada pemasukan"} />
            <Tile icon={CalendarDays} color="butter" label="Rata-rata harian" value={rupiah(r.avg_daily_expense_idr)} sub={`${r.transaction_count} transaksi`} />
          </div>

          <Card>
            <CardHeader title="Tren 6 bulan" subtitle="Pemasukan dan pengeluaran per bulan" action={<ViewToggle value={trendView} onChange={setTrendView} />} />
            <div className="px-5 pb-6 pt-4 sm:px-6">
              {trendView === "chart" ? (
                <>
                  <div className="mb-5">
                    <Legend items={[SERIES.income, SERIES.expense]} />
                  </div>
                  <TrendChart data={r.trend} highlight={r.month} />
                </>
              ) : (
                <TrendTable data={r.trend} />
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Pengeluaran per kategori" subtitle={monthLabel(month)} />
              <div className="px-5 pb-6 pt-5 sm:px-6">
                {r.expense_by_category.length ? (
                  <CategoryBars items={r.expense_by_category} kind="expense" limit={8} />
                ) : (
                  <EmptyState compact icon={ChartColumn} color="peach" title="Belum ada pengeluaran" description="Tidak ada pengeluaran tercatat di bulan ini." />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Pemasukan per kategori" subtitle={monthLabel(month)} />
              <div className="px-5 pb-6 pt-5 sm:px-6">
                {r.income_by_category.length ? (
                  <CategoryBars items={r.income_by_category} kind="income" limit={8} />
                ) : (
                  <EmptyState compact icon={PiggyBank} color="sky" title="Belum ada pemasukan" description="Tidak ada pemasukan tercatat di bulan ini." />
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Pengeluaran harian" subtitle={monthLabel(month)} action={<ViewToggle value={dailyView} onChange={setDailyView} />} />
            <div className="px-5 pb-6 pt-5 sm:px-6">
              {dailyView === "chart" ? <DailyChart data={r.daily} /> : <DailyTable data={r.daily} />}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

type TileProps = {
  icon: typeof Scale;
  color: string;
  label: string;
  value: string;
  sub?: string;
  negative?: boolean;
  delta?: { cur: number; prev: number; upIsGood: boolean; month: string };
};

function Tile({ icon, color, label, value, sub, negative, delta }: TileProps) {
  let deltaEl: React.ReactNode = null;
  if (delta) {
    if (delta.prev === 0) {
      deltaEl = <span className="text-[12px] text-muted">Belum ada data {monthShort(delta.month)}</span>;
    } else {
      const change = ((delta.cur - delta.prev) / delta.prev) * 100;
      const up = change >= 0;
      const good = up === delta.upIsGood;
      const Icon = up ? TrendingUp : TrendingDown;
      deltaEl = (
        <span className={clsx("inline-flex items-center gap-1 text-[12px] font-semibold", good ? "text-good-ink" : "text-bad-ink")}>
          <Icon className="size-3.5" aria-hidden />
          {up ? "+" : "−"}
          {pct(Math.abs(Math.round(change * 10) / 10))}
          <span className="font-normal text-muted">vs {monthShort(delta.month)}</span>
        </span>
      );
    }
  }
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <IconTile icon={icon} color={color} size="sm" />
        <p className="text-[13px] font-semibold text-muted">{label}</p>
      </div>
      <p className={clsx("mt-3 truncate text-xl font-extrabold tracking-tight", negative && "text-bad-ink")}>{value}</p>
      <div className="mt-1 min-h-5">{deltaEl ?? (sub && <span className="text-[12px] text-muted">{sub}</span>)}</div>
    </Card>
  );
}
