/** `Retry-After`(초 또는 HTTP 날짜)를 밀리초로 바꾼다. 없거나 읽을 수 없으면 0 이다. */
export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const delay = /^\d+$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}
