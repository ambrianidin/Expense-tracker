import clsx from "clsx";
import { PiggyBank } from "lucide-react";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-flex size-9 -rotate-6 items-center justify-center rounded-[14px] bg-primary-tint text-primary-ink">
        <PiggyBank className="size-5" strokeWidth={2.2} aria-hidden />
        <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[var(--peach-strong)] ring-2 ring-canvas" />
      </span>
      {!compact && <span className="text-[19px] font-extrabold tracking-tight">budgetly</span>}
    </span>
  );
}
