"use client";

import { useCallback, useRef, useState } from "react";

type ToastTone = "success" | "error";
export type ToastNotification = {
  id: number;
  message: string;
  tone?: ToastTone;
};

/** 같은 문구가 연속으로 와도 별개의 알림으로 표시한다. */
export function useToast() {
  const sequence = useRef(0);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const showToast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      setToast({ id: ++sequence.current, message, tone });
    },
    [],
  );
  const dismissToast = useCallback((id: number) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);
  return { toast, showToast, dismissToast };
}
