"use client";

import { useContext, useEffect, useRef } from "react";
import { RegisterExport } from "@/lib/dashboard-page-tools";

/**
 * 화면이 공통 헤더의 CSV 버튼에 내보내기를 등록한다. [run] 이 null 이면 버튼은 [disabledReason] 을 보이며 꺼진다.
 * 내보내기는 그 화면이 보이는 조건(기간·비교·snapshot)의 응답으로만 만든다(csv-export.ts).
 */
export function useDashboardPageExport(
  run: (() => Promise<void> | void) | null,
  disabledReason: string,
) {
  const register = useContext(RegisterExport);
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  }, [run]);
  const available = !!run;
  useEffect(() => {
    register?.({
      run: available ? () => latest.current?.() : null,
      disabledReason,
    });
    return () => register?.(null);
  }, [register, available, disabledReason]);
}
