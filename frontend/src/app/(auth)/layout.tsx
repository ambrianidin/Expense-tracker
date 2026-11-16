import { ChartPie, PiggyBank, Wallet } from "lucide-react";
import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden lg:grid-cols-[1.05fr_1fr]">
      
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary-tint p-12 lg:flex">
        <span className="absolute -left-24 top-24 size-72 rounded-full bg-[var(--mint-tint)] blur-2xl" aria-hidden />
        <span className="absolute -bottom-20 right-0 size-80 rounded-full bg-[var(--peach-tint)] blur-2xl" aria-hidden />
        <span className="absolute right-24 top-16 size-40 rounded-full bg-[var(--butter-tint)] blur-xl" aria-hidden />
        <Logo className="relative" />
        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            Uangmu, rapi dan
            <br />
            jelas arahnya.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            Catat pemasukan dan pengeluaran, atur batas budget, dan sisihkan dana untuk impianmu tanpa memindahkan uang.
          </p>
          <ul className="mt-10 space-y-3">
            {[
              { icon: Wallet, color: "sky", text: "Saldo semua akun dalam satu tempat" },
              { icon: ChartPie, color: "peach", text: "Budget bulanan per kategori" },
              { icon: PiggyBank, color: "mint", text: "Tabungan virtual untuk tiap tujuan" },
            ].map(({ icon: Icon, color, text }, i) => (
              <li
                key={text}
                className="flex items-center gap-3 rounded-2xl bg-surface/80 px-4 py-3 text-sm font-semibold shadow-soft backdrop-blur"
                style={{ transform: `rotate(${[-1, 0.8, -0.6][i]}deg)` }}
              >
                <span
                  className="inline-flex size-9 items-center justify-center rounded-xl"
                  style={{ background: `var(--${color}-tint)`, color: `var(--${color}-ink)` }}
                >
                  <Icon className="size-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-ink-soft">Mata uang IDR · Zona waktu Asia/Jakarta</p>
      </section>

      <section className="relative flex items-center justify-center px-5 py-12">
        <span className="absolute -right-16 -top-16 size-56 rounded-full bg-primary-tint blur-2xl lg:hidden" aria-hidden />
        <span className="absolute -bottom-20 -left-10 size-56 rounded-full bg-[var(--mint-tint)] blur-2xl lg:hidden" aria-hidden />
        <div className="relative w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </section>
    </div>
  );
}
