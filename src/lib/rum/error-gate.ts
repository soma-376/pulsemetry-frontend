// Limits only exceptions, so an error loop cannot suppress Web Vitals.
export function createErrorGate(now = Date.now) {
  let windowStart = now();
  let count = 0;
  const recent = new Map<string, number>();
  return (key: string) => {
    const time = now();
    if (time - windowStart >= 60_000) {
      windowStart = time;
      count = 0;
      recent.clear();
    }
    const last = recent.get(key);
    if (count >= 10 || (last !== undefined && time - last < 5000)) return false;
    recent.set(key, time);
    count++;
    return true;
  };
}
