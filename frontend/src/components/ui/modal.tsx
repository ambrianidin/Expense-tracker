"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { Button } from "./button";

type ModalProps = {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
};







export function Modal({ title, description, onClose, children, footer, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  
  
  
  useLayoutEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      
      
      d.querySelector<HTMLElement>(
        "[data-autofocus], input:not([type=hidden]):not([type=date]):not([type=time]):not([disabled]), textarea",
      )?.focus({ preventScroll: true });
    }
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={clsx(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[28px] bg-surface p-0 text-ink shadow-lift animate-sheet-in",
        "sm:m-auto sm:rounded-[28px] sm:animate-pop-in",
        size === "sm" && "sm:max-w-sm",
        size === "md" && "sm:max-w-lg",
        size === "lg" && "sm:max-w-2xl",
      )}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div>
            <h2 id={titleId} className="text-lg font-bold tracking-tight">
              {title}
            </h2>
            {description && <div className="mt-1 text-sm text-ink-soft">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="-mr-2 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
          >
            <X className="size-[18px]" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 pt-3">{children}</div>
        {footer && <div className="border-t border-line bg-canvas/60 px-6 py-4">{footer}</div>}
      </div>
    </dialog>
  );
}

type ConfirmProps = {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel, tone = "danger", loading, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="text-sm leading-relaxed text-ink-soft">{message}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Batal
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
