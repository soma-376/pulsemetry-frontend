"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

export function FilterMenu<T extends string>({ label, value, options, active, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  active: boolean;
  onChange: (value: T) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.findIndex((option) => option.value === value);

  const focusItem = (index: number) => {
    menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[index]?.focus({ preventScroll: true });
  };
  const show = (index = Math.max(0, selected)) => {
    menu.current?.showPopover();
    setOpen(true);
    focusItem(index);
  };
  const close = () => {
    menu.current?.hidePopover();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  // Render above the horizontally scrolling table, with the same surface tokens as other popovers.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !menu.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = menu.current.getBoundingClientRect();
      const below = anchor.bottom + 6;
      const top = below + bounds.height <= innerHeight - 8 ? below : anchor.top - bounds.height - 6;
      menu.current.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8))}px`;
      menu.current.style.top = `${Math.max(8, Math.min(top, innerHeight - bounds.height - 8))}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" aria-label={`${label} 필터${active ? `: ${options[selected]?.label}` : ""}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={id} popoverTarget={id}
      onClick={(event) => {
        event.preventDefault();
        if (open) close();
        else show();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          show(event.key === "ArrowUp" ? options.length - 1 : Math.max(0, selected));
        }
      }}
      className={`inline-flex max-w-full cursor-pointer items-center gap-1 rounded-sm py-1 text-left text-[11px] hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text ${active ? "font-semibold text-blue" : "text-text3"}`}>
      <span className="whitespace-nowrap">{active ? `${label}: ${options[selected]?.label}` : label}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h12L9 8.5V13l-2-1V8.5L2 3Z" />
      </svg>
    </button>
    <div ref={menu} id={id} popover="auto" role="menu" aria-label={`${label} 필터`}
      onToggle={(event) => setOpen(event.newState === "open")}
      onBlur={(event) => {
        if (event.relatedTarget !== trigger.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          menu.current?.hidePopover();
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (index + 1) % items.length
          : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length
          : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
        if (next !== null) { event.preventDefault(); focusItem(next); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        // Return to the trigger before letting Tab continue through the page normally.
        if (event.key === "Tab") close();
      }}
      className="fixed inset-auto m-0 max-h-[calc(100dvh-16px)] w-40 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-border bg-card p-1 text-text shadow-lg">
      {options.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === value} tabIndex={-1}
        onClick={() => { onChange(option.value); close(); }}
        className={`flex h-8 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 text-left text-[12px] transition-colors hover:bg-hover focus:bg-hover focus:outline-none ${option.value === value ? "bg-sub font-medium text-text" : "text-text2"}`}>
        {option.label}
        {option.value === value && <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8 3 3 6-6" /></svg>}
      </button>)}
    </div>
  </>;
}
