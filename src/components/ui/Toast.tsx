"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type Notification = { id: number; message: string };

/** 같은 문구로 연속 성공해도 별개의 알림으로 표시한다. */
export function useToast() {
  const sequence = useRef(0);
  const [toast, setToast] = useState<Notification | null>(null);
  const showToast = useCallback((message: string) => {
    setToast({ id: ++sequence.current, message });
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);
  return { toast, showToast, dismissToast };
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: Notification | null;
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[80] flex justify-end sm:left-auto sm:w-[380px]">
      {/* 알림 영역을 먼저 마운트해 이후 메시지 변경을 읽도록 한다. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="w-full"
      >
        <AnimatePresence mode="wait">
          {toast && (
            <ToastMessage
              key={toast.id}
              notification={toast}
              onDismiss={onDismiss}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ToastMessage({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: number) => void;
}) {
  const reduced = useReducedMotion();
  const remaining = useRef(4000);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const { id, message } = notification;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [id, paused, onDismiss]);

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 8 }}
      transition={{ duration: reduced ? 0 : 0.14 }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-card py-2 pr-2 pl-4 text-sm text-text shadow-lg"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="size-4 shrink-0 text-green"
      >
        <path
          d="m4 10 4 4 8-8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={() => onDismiss(id)}
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-text2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="size-4"
        >
          <path
            d="m5 5 10 10M15 5 5 15"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </motion.div>
  );
}
