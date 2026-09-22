"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/** 나가는 애니메이션 길이 — 이만큼 지나면 top layer 를 반납합니다 */
const EXIT_MS = 180;

/**
 * 가운데 정렬 모달.
 *
 * DetailDrawer 와 나란히 두는 이유: 측면 서랍은 "옆에서 더 본다", 모달은
 * "이 결정을 끝내기 전엔 못 나간다"는 뜻이라 쓰임이 다릅니다.
 * 좌석 회수 확인처럼 되돌리기 어려운 동작에는 모달을 씁니다.
 *
 * <dialog showModal> 을 써서 포커스 가둠·Esc·백드롭을 브라우저에 맡기고,
 * Tab 순환만 직접 처리합니다.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  footer,
  width = 520,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** 하단 액션 영역 — 스크롤과 무관하게 항상 보입니다 */
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const reduced = useReducedMotion();

  /*
    열고 닫는 것은 open 하나만 보고 결정합니다.
    나가는 애니메이션의 완료 콜백에 close() 를 맡기면, 그 콜백이 오지 않았을 때
    빈 모달이 top layer 를 계속 잡아 뒤 페이지 클릭이 통째로 막힙니다.
  */
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open) {
      if (!element.open) {
        element.showModal();
        close.current?.focus();
      }
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }

    if (!element.open) return;
    const timer = setTimeout(() => element.close(), reduced ? 0 : EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, reduced]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const targets = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = targets[0];
        const last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-text backdrop:bg-transparent"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            key="modal"
            className="absolute inset-0 flex items-center justify-center p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.section
              initial={{ scale: reduced ? 1 : 0.96, y: reduced ? 0 : 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: reduced ? 1 : 0.98, y: 0 }}
              transition={{ duration: reduced ? 0 : EXIT_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
              style={{ maxWidth: width }}
              className="relative flex max-h-full w-full flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-2xl"
            >
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-[15px] font-semibold">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="pretty mt-0.5 text-[11.5px] text-text3">{subtitle}</p>
                  )}
                </div>
                <button
                  ref={close}
                  type="button"
                  onClick={onClose}
                  aria-label="닫기"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-base text-text2 hover:bg-hover"
                >
                  ×
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

              {footer && (
                <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3">
                  {footer}
                </footer>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
