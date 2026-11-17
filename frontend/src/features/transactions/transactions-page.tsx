"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Plus, ReceiptText, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuickAdd } from "@/components/layout/app-shell";
import { Button, IconButton } from "@/components/ui/button";
import { Input, Segmented, Select } from "@/components/ui/field";
import { Card, EmptyState, ErrorNote, MonthPicker, PageHeader, Skeleton } from "@/components/ui/misc";
import { useAccounts, useCategories, useTransactions } from "@/lib/api/hooks";
import type { Transaction, TxType } from "@/lib/api/types";
import { currentMonth, dayKey, relativeDayLabel, rupiah } from "@/lib/format";
import { TransactionRow } from "./transaction-row";

const PAGE_SIZE = 30;

export function TransactionsPage() {
  const quick = useQuickAdd();
  const [month, setMonth] = useState(currentMonth());
  const [allTime, setAllTime] = useState(false);
  const [type, setType] = useState<TxType | "">("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  
  function withReset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  const accountsQ = useAccounts(true);
  const categoriesQ = useCategories(true);
  const txQ = useTransactions({
    month: allTime ? undefined : month,
    type,
    account_id: accountId,
    category_id: categoryId,
    q,
    page,
    page_size: PAGE_SIZE,
  });

  const categories = (categoriesQ.data ?? []).filter((c) => !type || c.type === type);
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of txQ.data?.items ?? []) {
      const k = dayKey(tx.occurred_at);
      map.set(k, [...(map.get(k) ?? []), tx]);
    }
    return [...map.entries()];
  }, [txQ.data]);

  const totalPages = Math.max(1, Math.ceil((txQ.data?.total ?? 0) / PAGE_SIZE));
  const hasFilters = !!(type || accountId || categoryId || q);
  const data = txQ.data;

  return (
    <div>
      <PageHeader
        title="Transaksi"
        subtitle="Semua pemasukan dan pengeluaran yang kamu catat."
        actions={
          <Button icon={Plus} onClick={() => quick.open()}>
            Catat transaksi
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {allTime ? (
          <Button variant="secondary" size="sm" onClick={() => withReset(setAllTime)(false)}>
            Semua waktu
            <X className="size-3.5" />
          </Button>
        ) : (
          <MonthPicker value={month} onChange={withReset(setMonth)} max={currentMonth()} />
        )}
        {!allTime && (
          <Button size="sm" variant="ghost" onClick={() => withReset(setAllTime)(true)}>
            Semua waktu
          </Button>
        )}
        <Segmented
          label="Filter jenis"
          size="sm"
          value={type}
          onChange={(v) => {
            setType(v);
            setCategoryId("");
            setPage(1);
          }}
          options={[
            { value: "", label: "Semua" },
            { value: "income", label: "Masuk" },
            { value: "expense", label: "Keluar" },
          ]}
        />
      </div>
      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr]">
        <Select aria-label="Filter akun" value={accountId} onChange={(e) => withReset(setAccountId)(e.target.value)}>
          <option value="">Semua akun</option>
          {accountsQ.data?.items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.is_archived ? " (arsip)" : ""}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter kategori" value={categoryId} onChange={(e) => withReset(setCategoryId)(e.target.value)}>
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_archived ? " (arsip)" : ""}
            </option>
          ))}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Cari transaksi" placeholder="Cari transaksi…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-11" />
        </div>
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
          <SummaryChip label="Pemasukan" value={`+${rupiah(data.totals.income_idr)}`} className="text-income-ink" />
          <SummaryChip label="Pengeluaran" value={`−${rupiah(data.totals.expense_idr)}`} />
          <SummaryChip label={`${data.total} transaksi`} value={rupiah(data.totals.net_idr)} className={data.totals.net_idr < 0 ? "text-bad-ink" : ""} />
        </div>
      )}

      {txQ.isError && <ErrorNote message={txQ.error.message} onRetry={() => txQ.refetch()} />}

      <Card className={clsx("p-2 sm:p-3", txQ.isPlaceholderData && "opacity-60")}>
        {txQ.isPending ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            color="lavender"
            title={hasFilters ? "Tidak ada yang cocok" : "Belum ada transaksi"}
            description={hasFilters ? "Coba ubah filter atau kata kunci pencarian." : "Catatan pemasukan dan pengeluaranmu akan muncul di sini."}
            action={!hasFilters && <Button icon={Plus} onClick={() => quick.open()}>Catat transaksi</Button>}
          />
        ) : (
          <div className="divide-y divide-line/70">
            {groups.map(([day, items]) => {
              const net = items.reduce((s, t) => s + (t.type === "income" ? t.amount_idr : -t.amount_idr), 0);
              return (
                <section key={day} className="py-2 first:pt-1">
                  <div className="flex items-center justify-between px-2 pb-1 pt-2">
                    <h3 className="text-[13px] font-bold capitalize text-ink-soft">{relativeDayLabel(day)}</h3>
                    <span className="tnum text-[12px] font-semibold text-muted">{net >= 0 ? "+" : "−"}{rupiah(Math.abs(net))}</span>
                  </div>
                  <ul>
                    {items.map((tx) => (
                      <li key={tx.id}>
                        <TransactionRow tx={tx} onClick={() => quick.open({ edit: tx })} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <IconButton icon={ChevronLeft} label="Halaman sebelumnya" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} />
          <span className="text-sm font-semibold text-ink-soft">
            Halaman {page} dari {totalPages}
          </span>
          <IconButton icon={ChevronRight} label="Halaman berikutnya" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} />
        </div>
      )}
    </div>
  );
}

function SummaryChip({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-2.5 sm:px-4">
      <p className="truncate text-[12px] font-semibold text-muted">{label}</p>
      <p className={clsx("tnum truncate text-sm font-bold sm:text-[15px]", className)}>{value}</p>
    </div>
  );
}
