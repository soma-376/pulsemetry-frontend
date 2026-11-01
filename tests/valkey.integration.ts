/** VALKEY_TEST_PORT의 전용 로컬 Valkey에서 실행한다. 운영 endpoint를 받지 않는다. */
import assert from "node:assert/strict";
import { createClient } from "redis";
import { randomUUID } from "node:crypto";
import {
  createValkeySessionStore,
  type SessionCommands,
} from "../src/lib/server/valkey-session-store";
import {
  compareSessionScript,
  takeSessionScript,
} from "../src/lib/server/valkey-connection";

async function main() {
  const port = Number(process.env.VALKEY_TEST_PORT);
  if (!Number.isInteger(port) || port < 1024 || port === 6379)
    throw new Error("검증 전용 포트가 필요합니다.");
  const a = createClient({ url: `redis://127.0.0.1:${port}` });
  const b = createClient({ url: `redis://127.0.0.1:${port}` });
  await Promise.all([a.connect(), b.connect()]);
  const commands = (client: typeof a): SessionCommands => ({
    get: (key) => client.get(key),
    async create(key, value, expiresAt) {
      return (
        (await client.set(key, value, {
          NX: true,
          expiration: { type: "PXAT", value: expiresAt },
        })) === "OK"
      );
    },
    async compareAndSet(key, expected, value, expiresAt) {
      return (
        (await client.eval(compareSessionScript, {
          keys: [key],
          arguments: [expected, value ?? "", String(expiresAt)],
        })) === 1
      );
    },
    async take(key) {
      const result = await client.eval(takeSessionScript, {
        keys: [key],
        arguments: [],
      });
      return typeof result === "string" ? result : null;
    },
  });
  const config = {
    origin: "https://test.example.test",
    keys: ["ab".repeat(32)],
    environment: "dev" as const,
    pollMs: 1,
  };
  const first = createValkeySessionStore(commands(a), config);
  const second = createValkeySessionStore(commands(b), config);
  const session = {
    id: randomUUID(),
    organizationId: randomUUID(),
    accessToken: "original-at",
    refreshToken: "original-rt",
    accessTokenExpiresAt: Date.now(),
    sessionExpiresAt: Date.now() + 30000,
  };
  const key = `dev:bff:session:${session.id}`;
  try {
    await first.create(session);
    let calls = 0;
    const rotate = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      return { ...session, accessToken: "next-at", refreshToken: "next-rt" };
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? first : second).refresh(session, rotate, async () => {}),
      ),
    );
    assert.equal(calls, 1);
    assert.ok(results.every((s) => s.refreshToken === "next-rt"));
    assert.equal(await a.pExpireTime(key), session.sessionExpiresAt);
    const raw = (await a.get(key))!;
    assert.equal(raw.includes("next-rt"), false);
    await second.remove(session.id);
    assert.equal(
      await commands(a).compareAndSet(key, raw, raw, session.sessionExpiresAt),
      false,
    );
    assert.equal(await first.read(session.id), null);
    console.log(
      "Valkey 실제 Lua: 20개 동시 요청 1회 갱신·절대 TTL·암호화·삭제 후 부활 방지 통과",
    );
  } finally {
    await a.del(key);
    await Promise.all([a.close(), b.close()]);
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
