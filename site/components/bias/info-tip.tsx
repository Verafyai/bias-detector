"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small info control next to a label.
 *
 * Every figure on this site needs a sentence saying what it is, and several of
 * them, bias magnitude above all, are actively misleading without one. Putting
 * that sentence in a tooltip keeps the number readable while making the
 * definition one tap away.
 *
 * Opens on hover for a mouse and on click for touch, closes on Escape and on a
 * click outside. It is a button rather than a div with a title attribute,
 * because a native title never appears on a phone, which is where most of the
 * people who need the definition are.
 */
export function InfoTip({ label, body }: { label: string; body: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative ml-1.5 inline-flex align-middle">
      <button
        type="button"
        aria-label={`What ${label} means`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/50 text-[10px] font-semibold leading-none text-muted-foreground transition-colors hover:border-teal-500 hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:text-teal-300"
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-[calc(100%+8px)] z-50 w-64 max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-left text-sm font-normal normal-case leading-relaxed tracking-normal text-popover-foreground shadow-lg"
        >
          {body}
        </span>
      ) : null}
    </span>
  );
}


