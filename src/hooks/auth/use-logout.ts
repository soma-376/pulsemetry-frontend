"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { backendLogout } from "@/lib/api/session";
import { useRateLimit } from "@/hooks/use-rate-limit";

/** 서버 로그아웃 성공 후 화면별 상태를 정리하고 로그인 화면으로 이동한다. */
export function useLogout({ onSuccess }: { onSuccess?: () => void } = {}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const rateLimit = useRateLimit();

  const logout = async () => {
    if (inFlight.current || rateLimit.waiting) return;
    inFlight.current = true;
    setLoggingOut(true);
    setError("");
    try {
      await backendLogout();
      onSuccess?.();
      router.replace("/login");
    } catch (cause) {
      setError(
        rateLimit.capture(cause)
          ? ""
          : cause instanceof Error
            ? cause.message
            : "로그아웃에 실패했습니다.",
      );
    } finally {
      inFlight.current = false;
      setLoggingOut(false);
    }
  };

  return { logout, loggingOut, error, rateLimit };
}
