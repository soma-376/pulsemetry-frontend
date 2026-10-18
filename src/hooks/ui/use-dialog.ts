"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { useReducedMotion } from "motion/react";

/** 모달과 드로어의 native dialog 수명 주기와 키보드 접근성을 공유한다. */
export function useDialog({
  open,
  onClose,
  onAfterClose,
  exitDelayMs,
}: {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  /** 애니메이션 완료 콜백이 없어도 top layer를 반납할 시간. */
  exitDelayMs: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const finishClose = useCallback(() => {
    const element = dialog.current;
    if (open || !element?.open) return;
    element.close();
    onAfterClose?.();
  }, [open, onAfterClose]);

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
    const timer = setTimeout(finishClose, reduced ? 0 : exitDelayMs);
    return () => clearTimeout(timer);
  }, [open, reduced, exitDelayMs, finishClose]);

  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
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
  };

  return { dialog, close, reduced, finishClose, onCancel, onKeyDown };
}
