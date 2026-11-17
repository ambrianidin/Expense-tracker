import { CalendarDays } from "lucide-react";
import type { Budget } from "@/lib/api/types";
import { rupiah } from "@/lib/format";

export function DailyAllowance({ budget, compact = false }: { budget: Budget; compact?: boolean }) {
  const daily = budget.daily_allowance;
  if (!daily) return null;
  if (daily.period === "past") return compact ? null : <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Periode selesai · jatah harian tidak berlaku.</p>;
  if (compact) return <p className="mt-1 text-xs text-ink-soft">Jatah {rupiah(daily.amount_idr)}/hari · {daily.days_remaining} hari tersisa</p>;
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-primary-tint/60 p-3.5">
      <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
      <div>
        <p className="text-xs font-semibold text-primary-ink">{daily.period === "future" ? "Rencana jatah harian" : "Jatah harian tersisa"}</p>
        <p className="mt-1 text-lg font-extrabold tracking-tight text-ink">{rupiah(daily.amount_idr)}<span className="ml-1 text-xs font-medium text-ink-soft">/hari</span></p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          {budget.remaining_idr <= 0 ? "Budget sudah habis. Tinjau pengeluaran atau sesuaikan batasnya." : daily.period === "future" ? `Sisa budget dibagi ${daily.days_remaining} hari dalam bulan ini.` : `Sisa budget dibagi ${daily.days_remaining} hari, termasuk hari ini (WIB).`}
        </p>
      </div>
    </div>
  );
}
