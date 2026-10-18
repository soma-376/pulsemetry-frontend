"use client";

import { useContext, useEffect, useRef } from "react";
import { RegisterRefresh } from "@/lib/dashboard-page-tools";
import type { RefreshFeedback } from "@/components/ui/RefreshNotice";

export function useDashboardPageRefresh(
  refresh: () => void,
  refreshing: boolean,
  feedback?: RefreshFeedback,
) {
  const register = useContext(RegisterRefresh);
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);
  const paused = feedback?.paused;
  const updatedAt = feedback?.updatedAt;
  const partial = feedback?.partial;
  useEffect(() => {
    register?.({
      refresh: () => latest.current(),
      refreshing,
      feedback:
        paused === undefined
          ? undefined
          : { paused, updatedAt: updatedAt ?? 0, partial },
    });
    return () => register?.(null);
  }, [register, refreshing, paused, updatedAt, partial]);
}
