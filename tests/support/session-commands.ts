import type { SessionCommands } from "../../src/lib/server/valkey-session-store";

/** Valkey의 단일 명령 원자성을 모델링한다. 실제 Lua는 별도 통합 테스트로 검증한다. */
export function memorySessionCommands(now = Date.now) {
  const values = new Map<string, { value: string; expiresAt: number }>();
  let unavailable = false;
  function read(key: string) {
    if (unavailable) throw new Error("connection failed");
    const entry = values.get(key);
    if (entry && entry.expiresAt <= now()) values.delete(key);
    return values.get(key)?.value ?? null;
  }
  const commands: SessionCommands = {
    async get(key) {
      return read(key);
    },
    async create(key, value, expiresAt) {
      if (read(key) !== null) return false;
      values.set(key, { value, expiresAt });
      return true;
    },
    async compareAndSet(key, expected, value, expiresAt) {
      if (read(key) !== expected) return false;
      if (value === null) values.delete(key);
      else values.set(key, { value, expiresAt });
      return true;
    },
    async take(key) {
      const value = read(key);
      values.delete(key);
      return value;
    },
  };
  return {
    commands,
    values,
    unavailable(value: boolean) {
      unavailable = value;
    },
  };
}
