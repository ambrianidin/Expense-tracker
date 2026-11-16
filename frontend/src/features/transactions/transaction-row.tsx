"use client";

import clsx from "clsx";
import { IconTile } from "@/components/ui/misc";
import type { Transaction } from "@/lib/api/types";
import { iconFor } from "@/lib/catalog";
import { signedRupiah, timeLabel } from "@/lib/format";

export function TransactionRow({ tx, onClick, showDate }: { tx: Transaction; onClick?: () => void; showDate?: string }) {
  const sub = [tx.note || tx.account.name, showDate ?? timeLabel(tx.occurred_at)].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-sunken/70 active:scale-[0.99]"
    >
      <IconTile icon={iconFor(tx.category.icon)} color={tx.category.color} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{tx.category.name}</p>
        <p className="truncate text-[13px] text-muted">{sub}</p>
      </div>
      <span className={clsx("tnum shrink-0 text-sm font-bold", tx.type === "income" ? "text-income-ink" : "text-ink")}>
        {signedRupiah(tx.amount_idr, tx.type)}
      </span>
    </button>
  );
}
