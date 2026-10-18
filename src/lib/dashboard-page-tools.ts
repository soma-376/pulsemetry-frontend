"use client";

import { createContext } from "react";
import type { RefreshFeedback } from "@/components/ui/RefreshNotice";

export type PageRefresh = {
  refresh: () => void;
  refreshing: boolean;
  feedback?: RefreshFeedback;
};
export const RegisterRefresh = createContext<
  ((value: PageRefresh | null) => void) | null
>(null);
/** 화면이 등록한 CSV 내보내기. `run`이 없으면 `disabledReason`을 버튼에 보인다. */
export type PageExport = {
  run: (() => Promise<void> | void) | null;
  disabledReason: string;
};
export const RegisterExport = createContext<
  ((value: PageExport | null) => void) | null
>(null);
