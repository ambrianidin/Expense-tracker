"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { forwardRef, useId } from "react";
import { digits } from "@/lib/format";

export const inputClass =
  "form-control transition-colors " +
  "focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 " +
  "aria-[invalid=true]:border-bad aria-[invalid=true]:focus:ring-bad/15 disabled:bg-sunken disabled:text-muted";

type FieldProps = {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
  className?: string;
};


export function Field({ label, error, hint, optional, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={clsx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold leading-5 text-ink-soft">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(opsional)</span>}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] font-medium text-bad-ink" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(inputClass, className)} {...rest} />;
});

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputClass, "h-auto min-h-20 resize-none py-3 leading-6", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={clsx("relative min-w-0", className)}>
      <select className={clsx(inputClass, "appearance-none pr-10")} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

type MoneyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> & {
  value: number | null;
  onValueChange: (v: number | null) => void;
  size?: "md" | "lg";
};


export function MoneyInput({ value, onValueChange, size = "md", className, ...rest }: MoneyInputProps) {
  return (
    <div className={clsx("relative min-w-0", className)}>
      <span
        className={clsx(
          "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold leading-none text-muted",
          size === "lg" ? "text-lg" : "text-[15px]",
        )}
      >
        Rp
      </span>
      <input
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        className={clsx(
          inputClass,
          "tnum font-semibold",
          size === "lg" ? "h-14 pl-12 text-2xl leading-8 tracking-tight" : "pl-11",
        )}
        value={value === null ? "" : digits(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 13);
          onValueChange(raw === "" ? null : Number(raw));
        }}
        {...rest}
      />
    </div>
  );
}

type SegmentedProps<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }>; tone?: string }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
};

export function Segmented<T extends string>({ value, onChange, options, label, size = "md", className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx("inline-grid max-w-full auto-cols-fr grid-flow-col items-center gap-1 rounded-full bg-sunken p-1 align-middle", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-full font-semibold transition-colors",
              size === "sm" ? "h-7 gap-1.5 px-3 text-[13px]/none" : "h-9 gap-1 px-1 text-[13px]/none sm:gap-1.5 sm:px-4 sm:text-sm/none",
              active ? "bg-surface text-ink ring-1 ring-inset ring-line/60" : "text-ink-soft hover:text-ink",
            )}
          >
            {Icon && <Icon className={clsx("shrink-0", size === "sm" ? "size-4" : "size-3.5 sm:size-4", active && o.tone)} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
