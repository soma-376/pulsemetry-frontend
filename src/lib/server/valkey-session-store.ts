import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createSessionPayloadCipher, type Session } from "./session-cookie";

export class SessionStoreError extends Error {
  constructor(
    public status: 401 | 503,
    public code: string,
  ) {
    super(code);
  }
}
export interface SessionCommands {
  get(key: string): Promise<string | null>;
  create(key: string, value: string, expiresAt: number): Promise<boolean>;
  compareAndSet(
    key: string,
    expected: string,
    value: string | null,
    expiresAt: number,
  ): Promise<boolean>;
  take(key: string): Promise<string | null>;
}
export interface SessionStore {
  create(session: Session): Promise<void>;
  read(id: string): Promise<Session | null>;
  remove(id: string): Promise<Session | null>;
  refresh(
    session: Session,
    rotate: () => Promise<Session>,
    revoke: (session: Session) => Promise<void>,
  ): Promise<Session>;
}
const recordSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  sessionExpiresAt: z.number(),
  encryptedSession: z.string(),
  refresh: z.object({ owner: z.string(), startedAt: z.number() }).nullable(),
});
type RecordValue = z.infer<typeof recordSchema>;
const invalid = () =>
  new SessionStoreError(401, "session_reauthentication_required");

export function createValkeySessionStore(
  commands: SessionCommands,
  config: {
    origin: string;
    keys: string[];
    environment: "dev" | "prod";
    waitMs?: number;
    abandonedMs?: number;
    pollMs?: number;
  },
  now = Date.now,
): SessionStore {
  // 쿠키와 저장소 암호문의 목적·환경을 분리하고 기존 키 회전을 지원한다.
  const cipher = createSessionPayloadCipher(
    {
      origin: config.origin,
      keys: config.keys.map((key) =>
        createHash("sha256")
          .update(`valkey:${config.environment}:`)
          .update(Buffer.from(key, "hex"))
          .digest("hex"),
      ),
    },
    now,
    16384,
  );
  const key = (id: string) => {
    if (!z.uuid().safeParse(id).success) throw invalid();
    return `${config.environment}:bff:session:${id}`;
  };
  async function io<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch {
      throw new SessionStoreError(503, "session_store_unavailable");
    }
  }
  function decode(raw: string, id: string) {
    try {
      const record = recordSchema.parse(JSON.parse(raw));
      const session = cipher.unseal(record.encryptedSession);
      if (
        !session ||
        session.id !== id ||
        session.sessionExpiresAt !== record.sessionExpiresAt
      )
        throw invalid();
      return { raw, record, session };
    } catch {
      throw invalid();
    }
  }
  async function load(id: string) {
    const raw = await io(() => commands.get(key(id)));
    return raw === null ? null : decode(raw, id);
  }
  const cas = (
    id: string,
    raw: string,
    next: RecordValue | null,
    expiresAt: number,
  ) =>
    io(() =>
      commands.compareAndSet(
        key(id),
        raw,
        next ? JSON.stringify(next) : null,
        expiresAt,
      ),
    );
  return {
    async create(session) {
      const value: RecordValue = {
        schemaVersion: 1,
        revision: 0,
        sessionExpiresAt: session.sessionExpiresAt,
        encryptedSession: cipher.seal(session),
        refresh: null,
      };
      if (
        !(await io(() =>
          commands.create(
            key(session.id),
            JSON.stringify(value),
            session.sessionExpiresAt,
          ),
        ))
      )
        throw invalid();
    },
    async read(id) {
      return (await load(id))?.session ?? null;
    },
    async remove(id) {
      const raw = await io(() => commands.take(key(id)));
      if (raw === null) return null;
      try {
        return decode(raw, id).session;
      } catch {
        return null;
      } // 이미 제거된 손상 세션이 새 로그인을 막지 않게 한다.
    },
    async refresh(session, rotate, revoke) {
      const deadline = performance.now() + (config.waitMs ?? 12000);
      for (;;) {
        const current = await load(session.id);
        if (!current) throw invalid();
        const { raw, record, session: latest } = current;
        if (record.refresh) {
          if (
            now() - record.refresh.startedAt >=
            (config.abandonedMs ?? 20000)
          ) {
            if (await cas(session.id, raw, null, record.sessionExpiresAt))
              throw invalid();
            continue;
          }
        } else if (
          latest.refreshToken !== session.refreshToken ||
          latest.accessToken !== session.accessToken
        ) {
          return latest;
        } else {
          const claimed: RecordValue = {
            ...record,
            refresh: { owner: randomUUID(), startedAt: now() },
          };
          if (await cas(session.id, raw, claimed, record.sessionExpiresAt)) {
            const claimedRaw = JSON.stringify(claimed);
            let next: Session;
            try {
              next = await rotate();
            } catch {
              // 결과가 불명확해도 구 RT를 재제출하지 않는다. 삭제 실패 시에도 refreshing을 남긴다.
              await cas(session.id, claimedRaw, null, record.sessionExpiresAt);
              throw invalid();
            }
            try {
              const updated: RecordValue = {
                ...record,
                revision: record.revision + 1,
                encryptedSession: cipher.seal(next),
                refresh: null,
              };
              if (
                await cas(
                  session.id,
                  claimedRaw,
                  updated,
                  record.sessionExpiresAt,
                )
              )
                return next;
            } catch (error) {
              await revoke(next).catch(() => undefined);
              if (error instanceof SessionStoreError) throw error;
              await cas(session.id, claimedRaw, null, record.sessionExpiresAt);
              throw invalid();
            }
            // 로그아웃·만료·다른 처리가 변경한 세션을 부활시키지 않는다.
            await revoke(next).catch(() => undefined);
            throw invalid();
          }
        }
        if (performance.now() >= deadline)
          throw new SessionStoreError(503, "session_refresh_pending");
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            (config.pollMs ?? 100) + Math.floor(Math.random() * 50),
          ),
        );
      }
    },
  };
}
