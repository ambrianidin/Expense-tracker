"use client";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChartPie,
  Moon,
  PiggyBank,
  Plus,
  ReceiptText,
  Scale,
  Sun,
  Sunrise,
  Sunset,
  TriangleExclamationPoint,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useQuickAdd } from "@/components/layout/app-shell";
import { Button, LinkButton } from "@/components/ui/button";
import { BudgetBadge, Card, CardHeader, EmptyState, ErrorNote, IconTile, Meter, MonthPicker, Skeleton, budgetTone } from "@/components/ui/misc";
import { CategoryBars } from "@/features/charts/charts";
import { TransactionRow } from "@/features/transactions/transaction-row";
import { useMe, useSummary } from "@/lib/api/hooks";
import { iconFor, tone } from "@/lib/catalog";
import { currentMonth, dateLabel, dayKey, firstName, greeting, monthLabel, pct, rupiah, todayISO } from "@/lib/format";

export function Dashboard() {
  const me = useMe();
  const [month, setMonth] = useState(currentMonth());
  const summary = useSummary(month);
  const quick = useQuickAdd();
  const g = greeting();
  const GreetIcon = { morning: Sunrise, noon: Sun, evening: Sunset, night: Moon }[g.period];
  const s = summary.data;
  const isCurrent = month === currentMonth();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3.5">
          <IconTile icon={GreetIcon} color="butter" size="lg" tilt />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">
              {g.text}, {firstName(me.data?.name ?? "")}
            </h1>
            <p className="mt-0.5 text-sm text-ink-soft">Begini kondisi keuanganmu {isCurrent ? "bulan ini" : `di ${monthLabel(month)}`}.</p>
          </div>
        </div>
        <MonthPicker value={month} onChange={setMonth} max={currentMonth()} className="self-start sm:self-auto" />
      </div>

      {summary.isError && <ErrorNote message={summary.error.message} onRetry={() => summary.refetch()} />}

      {!s ? (
        <DashboardSkeleton />
      ) : !s.has_accounts ? (
        <Card className="overflow-hidden">
          <EmptyState
            icon={Wallet}
            color="sky"
            title="Ayo mulai dengan akun pertamamu"
            description="Tambahkan rekening bank, e-wallet, atau uang tunai beserta saldo awalnya. Setelah itu kamu bisa mulai mencatat transaksi."
            action={<LinkButton href="/onboarding" icon={Plus}>Tambah akun</LinkButton>}
          />
        </Card>
      ) : (
        <div className={summary.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {(s.warnings.available_negative || s.warnings.negative_accounts.length > 0) && (
            <div className="mb-6 flex items-start gap-3 rounded-3xl border border-[var(--butter-strong)]/40 bg-warn-tint px-5 py-4 text-sm text-warn-ink" role="status">
              <TriangleExclamationPoint className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-bold">Ada angka yang perlu dicek</p>
                <p className="mt-0.5">
                  {s.warnings.available_negative
                    ? "Pengeluaranmu melebihi dana yang belum dialokasikan. Pertimbangkan melepas sebagian tabungan atau cek ulang catatan."
                    : "Ada akun dengan saldo minus. Mungkin ada transaksi yang belum tercatat."}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <section className="relative overflow-hidden rounded-[32px] bg-primary-tint p-6 sm:p-8">
              <span className="absolute -right-10 -top-12 size-44 rounded-full bg-surface/50" aria-hidden />
              <span className="absolute -bottom-16 right-20 size-36 rounded-full bg-[var(--mint-tint)]/80" aria-hidden />
              <div className="relative">
                <p className="text-sm font-semibold text-primary-ink">Siap dipakai</p>
                <p className={`mt-2 text-[clamp(2rem,3.6vw,3.25rem)] font-extrabold leading-none tracking-tight ${s.available_to_spend_idr < 0 ? "text-bad-ink" : ""}`}>
                  {rupiah(s.available_to_spend_idr)}
                </p>
                <p className="mt-3 max-w-md text-[13px] leading-relaxed text-ink-soft">
                  Total saldo {rupiah(s.total_balance_idr)} dikurangi dana yang kamu sisihkan untuk tabungan {rupiah(s.reserved_savings_idr)}.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={ArrowDownLeft} onClick={() => quick.open({ type: "income" })}>
                    Pemasukan
                  </Button>
                  <Button size="sm" variant="secondary" icon={ArrowUpRight} onClick={() => quick.open({ type: "expense" })}>
                    Pengeluaran
                  </Button>
                </div>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <MiniTile href="/accounts" icon={Wallet} color="sky" label="Total saldo" value={rupiah(s.total_balance_idr)} sub={`${s.accounts.length} akun aktif`} negative={s.total_balance_idr < 0} />
              <MiniTile href="/savings" icon={PiggyBank} color="mint" label="Dana tabungan" value={rupiah(s.reserved_savings_idr)} sub={`${s.goals.length} goal aktif`} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatTile icon={ArrowDownLeft} color="sky" label="Pemasukan" value={s.monthly_income_idr} />
            <StatTile icon={ArrowUpRight} color="peach" label="Pengeluaran" value={s.monthly_expense_idr} />
            <StatTile icon={Scale} color="lavender" label="Selisih" value={s.net_cash_flow_idr} signed />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Pengeluaran per kategori" subtitle={monthLabel(month)} action={<MoreLink href="/reports" label="Laporan" />} />
              <div className="px-5 pb-6 pt-5 sm:px-6">
                {s.expense_by_category.length ? (
                  <CategoryBars items={s.expense_by_category} kind="expense" limit={5} />
                ) : (
                  <EmptyState compact icon={ChartPie} color="peach" title="Belum ada pengeluaran" description="Pengeluaran yang kamu catat akan muncul di sini per kategori." />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Budget bulan ini"
                subtitle={s.budgets.items.length ? `${rupiah(s.budgets.totals.spent_idr)} dari ${rupiah(s.budgets.totals.limit_idr)} terpakai` : monthLabel(month)}
                action={<MoreLink href="/budgets" label="Kelola" />}
              />
              <div className="px-5 pb-6 pt-5 sm:px-6">
                {s.budgets.items.length ? (
                  <ul className="space-y-4">
                    {s.budgets.items.slice(0, 4).map((b) => {
                      const t = budgetTone[b.status];
                      return (
                        <li key={b.id}>
                          <div className="mb-2 flex items-center gap-3">
                            <IconTile icon={iconFor(b.category.icon)} color={b.category.color} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{b.category.name}</p>
                              <p className="tnum text-[12px] text-muted">
                                {rupiah(b.spent_idr)} / {rupiah(b.limit_idr)}
                              </p>
                            </div>
                            <BudgetBadge status={b.status} usage={b.usage_pct} />
                          </div>
                          <Meter value={b.usage_pct} color={t.fill} track={t.track} label={`Budget ${b.category.name} terpakai ${pct(b.usage_pct)}`} size="sm" />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    icon={ChartPie}
                    color="butter"
                    title="Belum ada budget"
                    description="Tetapkan batas pengeluaran per kategori supaya tahu kapan harus mengerem."
                    action={<LinkButton href="/budgets" size="sm" variant="soft" icon={Plus}>Buat budget</LinkButton>}
                  />
                )}
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
            <Card>
              <CardHeader title="Target tabungan" subtitle="Dana disisihkan secara virtual" action={<MoreLink href="/savings" label="Semua" />} />
              <div className="px-5 pb-6 pt-5 sm:px-6">
                {s.goals.length ? (
                  <ul className="space-y-4">
                    {s.goals.slice(0, 3).map((goal) => {
                      const t = tone(goal.color);
                      return (
                        <li key={goal.id} className="flex items-center gap-3">
                          <IconTile icon={iconFor(goal.icon)} color={goal.color} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-sm font-semibold">{goal.title}</p>
                              <p className="tnum shrink-0 text-[12px] font-bold text-ink-soft">{pct(goal.progress_pct)}</p>
                            </div>
                            <div className="my-1.5">
                              <Meter value={goal.progress_pct} color={t.strong} track={t.tint} label={`Progres ${goal.title}`} size="sm" />
                            </div>
                            <p className="tnum text-[12px] text-muted">
                              {rupiah(goal.saved_idr)} dari {rupiah(goal.target_amount_idr)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    icon={PiggyBank}
                    color="mint"
                    title="Belum ada target"
                    description="Mau beli laptop atau liburan? Buat goal dan sisihkan dananya sedikit-sedikit."
                    action={<LinkButton href="/savings" size="sm" variant="soft" icon={Plus}>Buat goal</LinkButton>}
                  />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Transaksi terbaru" action={<MoreLink href="/transactions" label="Lihat semua" />} />
              <div className="px-3 pb-4 pt-3 sm:px-4">
                {s.recent_transactions.length ? (
                  <ul>
                    {s.recent_transactions.map((tx) => {
                      const d = dayKey(tx.occurred_at);
                      return (
                        <li key={tx.id}>
                          <TransactionRow
                            tx={tx}
                            onClick={() => quick.open({ edit: tx })}
                            showDate={d === todayISO() ? "Hari ini" : dateLabel(d, { day: "numeric", month: "short" })}
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    icon={ReceiptText}
                    color="lavender"
                    title="Belum ada transaksi"
                    description="Catat pemasukan atau pengeluaran pertamamu."
                    action={<Button size="sm" variant="soft" icon={Plus} onClick={() => quick.open()}>Catat sekarang</Button>}
                  />
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniTile({ href, icon, color, label, value, sub, negative }: { href: string; icon: typeof Wallet; color: string; label: string; value: string; sub: string; negative?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-3.5 rounded-[28px] border border-line bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
      <IconTile icon={icon} color={color} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-muted">{label}</p>
        <p className={`truncate text-lg font-extrabold tracking-tight xl:text-xl ${negative ? "text-bad-ink" : ""}`} title={value}>
          {value}
        </p>
        <p className="text-[12px] text-muted">{sub}</p>
      </div>
      <ArrowRight className="hidden size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink xl:block" />
    </Link>
  );
}

function StatTile({ icon, color, label, value, signed }: { icon: typeof Wallet; color: string; label: string; value: number; signed?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <IconTile icon={icon} color={color} size="sm" />
        <p className="text-[13px] font-semibold text-muted">{label}</p>
      </div>
      <p className={`mt-3 truncate text-lg font-extrabold tracking-tight xl:text-xl ${signed && value < 0 ? "text-bad-ink" : ""}`}>
        {signed && value > 0 ? "+" : ""}
        {rupiah(value)}
      </p>
    </Card>
  );
}

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-primary-ink transition hover:bg-primary-tint">
      {label}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <Skeleton className="h-60 rounded-[32px]" />
        <div className="grid gap-4">
          <Skeleton className="h-28 rounded-[28px]" />
          <Skeleton className="h-28 rounded-[28px]" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-[28px]" />
        <Skeleton className="h-24 rounded-[28px]" />
        <Skeleton className="h-24 rounded-[28px]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-[28px]" />
        <Skeleton className="h-72 rounded-[28px]" />
      </div>
    </div>
  );
}
