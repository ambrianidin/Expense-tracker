import clsx from "clsx";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "soft" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-strong shadow-[0_8px_18px_-8px_rgb(106_92_235/0.65)]",
  secondary: "border border-line bg-surface text-ink hover:border-line-strong hover:bg-sunken",
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  soft: "bg-primary-tint text-primary-ink hover:bg-[#e4dfff]",
  danger: "bg-bad-ink text-white hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", icon: Icon, loading, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className={size === "sm" ? "size-4" : "size-[18px]"} strokeWidth={2.25} aria-hidden />
      )}
      {children}
    </button>
  );
});

type LinkButtonProps = React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: LucideIcon };


export function LinkButton({ variant = "primary", size = "md", icon: Icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold transition-all duration-150 active:scale-[0.97]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className={size === "sm" ? "size-4" : "size-[18px]"} strokeWidth={2.25} aria-hidden />}
      {children}
    </Link>
  );
}

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  tone?: "default" | "danger";
  size?: "sm" | "md";
};

export function IconButton({ icon: Icon, label, tone = "default", size = "md", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40",
        size === "sm" ? "size-8" : "size-10",
        tone === "danger" ? "text-bad-ink hover:bg-bad-tint" : "text-ink-soft hover:bg-sunken hover:text-ink",
        className,
      )}
      {...rest}
    >
      <Icon className={size === "sm" ? "size-4" : "size-[18px]"} strokeWidth={2.1} aria-hidden />
    </button>
  );
}
