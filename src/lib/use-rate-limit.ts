"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthError, remainingSeconds } from "@/lib/api/auth-error";

/**
 * 인증 요청 제한(429)의 안내와 대기. 서버가 준 `Retry-After` 동안 같은 요청을 다시 보내지 않도록 호출자가 `waiting`으로 버튼을 잠근다.
 * `message`는 안내가 처음 나올 때의 문장 그대로다 — 남은 시간은 `seconds`로 따로 그린다(화면 낭독기가 매초 읽지 않게).
 */
export function useRateLimit() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (until === null) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= until) setUntil(null);
    }, 250);
    return () => window.clearInterval(timer);
  }, [until]);
  const seconds = remainingSeconds(until, now);
  /** 429 이고 서버가 대기 시간을 줬으면 안내와 대기를 시작하고 true 다. 아니면 호출자가 평소대로 오류를 그린다. */
  const capture = useCallback((cause: unknown) => {
    if (
      !(cause instanceof AuthError) ||
      cause.status !== 429 ||
      cause.retryAfterMs <= 0
    )
      return false;
    const time = Date.now();
    setNow(time);
    setUntil(time + cause.retryAfterMs);
    setNotice(cause.message);
    return true;
  }, []);
  return {
    waiting: seconds > 0,
    seconds,
    message: seconds > 0 ? notice : "",
    capture,
  };
}
