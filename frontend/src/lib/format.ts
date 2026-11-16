
export const TZ = "Asia/Jakarta";

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });


export function rupiah(v: number): string {
  return idr.format(v).replace(/ /g, " ");
}


export function signedRupiah(v: number, kind: "income" | "expense"): string {
  return `${kind === "income" ? "+" : "−"}${rupiah(Math.abs(v))}`;
}

export function digits(v: number): string {
  return plain.format(v);
}


export function compactRupiah(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} jt`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)} rb`;
  return `${sign}${abs}`;
}

function trim(n: number): string {
  return n.toLocaleString("id-ID", { maximumFractionDigits: n < 10 ? 1 : 0 });
}

export function pct(v: number): string {
  return `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

function parts(date: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}


export function todayISO(now = new Date()): string {
  const { y, m, d } = parts(now);
  return `${y}-${m}-${d}`;
}

export function nowTimeHM(now = new Date()): string {
  const { hh, mm } = parts(now);
  return `${hh}:${mm}`;
}


export function currentMonth(now = new Date()): string {
  return todayISO(now).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string, style: "long" | "short" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: style, year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function monthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}


export function toLocalParts(iso: string): { date: string; time: string } {
  const { y, m, d, hh, mm } = parts(new Date(iso));
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}


export function fromLocalParts(date: string, time: string): string {
  return `${date}T${time || "12:00"}:00+07:00`;
}

export function dayKey(iso: string): string {
  return toLocalParts(iso).date;
}

export function dateLabel(isoDate: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function relativeDayLabel(isoDate: string, now = new Date()): string {
  const today = todayISO(now);
  const yesterday = todayISO(new Date(now.getTime() - 86_400_000));
  if (isoDate === today) return "Hari ini";
  if (isoDate === yesterday) return "Kemarin";
  return dateLabel(isoDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function timeLabel(iso: string): string {
  return toLocalParts(iso).time;
}

export function greeting(now = new Date()): { text: string; period: "morning" | "noon" | "evening" | "night" } {
  const h = Number(parts(now).hh);
  if (h < 11) return { text: "Selamat pagi", period: "morning" };
  if (h < 15) return { text: "Selamat siang", period: "noon" };
  if (h < 19) return { text: "Selamat sore", period: "evening" };
  return { text: "Selamat malam", period: "night" };
}


export function monthsUntil(isoDate: string, now = new Date()): number {
  const [ty, tm] = todayISO(now).split("-").map(Number);
  const [y, m] = isoDate.split("-").map(Number);
  return (y - ty) * 12 + (m - tm);
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
