"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/** 나가는 애니메이션 길이 — 이만큼 지나면 top layer 를 반납합니다 */
const EXIT_MS = 240;

export function DetailDrawer({ open, onClose, title, subtitle, footer, children }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string;
  /** 하단 액션 영역 — 넘기지 않으면 닫는 방법 안내가 들어갑니다 */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const reduced = useReducedMotion();
  /*
    열고 닫는 것은 open 하나만 보고 결정합니다.
    나가는 애니메이션의 완료 콜백에 close() 를 맡기면, 그 콜백이 오지 않았을 때
    빈 서랍이 top layer 를 계속 잡아 뒤 페이지 클릭이 통째로 막힙니다.
  */
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open) {
      if (!element.open) { element.showModal(); close.current?.focus(); }
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previous; };
    }

    if (!element.open) return;
    const timer = setTimeout(() => element.close(), reduced ? 0 : EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, reduced]);

  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
        const first = targets[0];
        const last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden bg-transparent p-0 text-text backdrop:bg-transparent">
      <AnimatePresence>
        {open && (
          <motion.div key="drawer" className="absolute inset-0 overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
            <motion.section initial={{ x: reduced ? 0 : "100%" }} animate={{ x: 0 }} exit={{ x: reduced ? 0 : "100%" }} transition={{ type: "tween", duration: reduced ? 0 : EXIT_MS / 1000, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-border bg-card shadow-2xl">
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-6">
                <div><h2 id={titleId} className="text-lg font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-xs text-text3">{subtitle}</p>}</div>
                <button ref={close} type="button" onClick={onClose} aria-label="상세 패널 닫기" className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-lg hover:bg-hover">×</button>
              </header>
              <div tabIndex={0} aria-label="팀 상세 내용" className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
              <footer className="shrink-0 border-t border-border px-6 py-3 text-[11px] text-text3">{footer ?? "Esc 키 또는 바깥 영역을 눌러 닫기"}</footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
