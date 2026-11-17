import clsx from "clsx";
import Image from "next/image";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/brand/savena-logo.png"
        alt={compact ? "Savena" : ""}
        width={36}
        height={36}
        className="size-9 shrink-0"
      />
      {!compact && <span className="text-[19px] font-extrabold tracking-tight">Savena</span>}
    </span>
  );
}
