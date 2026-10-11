// 무상태 쿠키 코덱. Proxy에서 BFF의 갱신 캐시를 참조하지 않는다.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const sessionSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.number(),
  sessionExpiresAt: z.number(),
});
export type Session = z.infer<typeof sessionSchema>;

export class SessionCookieError extends Error {}
export function sessionCookieConfig() {
  if (!process.env.BFF_ORIGIN || !process.env.BFF_SESSION_KEYS)
    throw new Error("BFF 쿠키 설정이 필요합니다.");
  return {
    origin: process.env.BFF_ORIGIN,
    keys: process.env.BFF_SESSION_KEYS.split(",").map((v) => v.trim()),
  };
}
export function createSessionCookie(
  config: { origin: string; keys: string[] },
  now = Date.now,
) {
  const origin = new URL(config.origin).origin;
  const secure = new URL(origin).protocol === "https:";
  if (
    !secure &&
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)
  )
    throw new Error("BFF_ORIGIN은 HTTPS 또는 로컬 개발 주소여야 합니다.");
  const cookieName = secure
    ? "__Host-pulsemetry-session"
    : "pulsemetry-session";
  const keys = config.keys.map((value) => {
    if (!/^[a-fA-F0-9]{64}$/.test(value))
      throw new Error(
        "BFF_SESSION_KEYS에는 32바이트 키를 hex 64자로 설정하세요.",
      );
    const key = Buffer.from(value, "hex");
    return {
      key,
      id: createHash("sha256").update(key).digest("hex").slice(0, 16),
    };
  });
  if (!keys.length || keys.length > 3)
    throw new Error(
      "BFF_SESSION_KEYS는 현재 키와 이전 키를 최대 3개까지 지원합니다.",
    );
  const aad = Buffer.from(`${origin}:${cookieName}:v1`);
  function seal(session: Session) {
    const iv = randomBytes(12),
      active = keys[0];
    const cipher = createCipheriv("aes-256-gcm", active.key, iv);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(session)),
      cipher.final(),
    ]);
    const value = [
      "v1",
      active.id,
      iv.toString("base64url"),
      encrypted.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
    ].join(".");
    if (value.length > 3800) throw new SessionCookieError("session_too_large");
    return value;
  }
  function read(request: Request): Session | null {
    const value = request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!value || value.length > 3800) return null;
    try {
      const [version, id, iv, encrypted, tag, extra] = value.split(".");
      const key = keys.find((k) => k.id === id);
      if (
        version !== "v1" ||
        !key ||
        extra !== undefined ||
        !iv ||
        !encrypted ||
        !tag
      )
        return null;
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key.key,
        Buffer.from(iv, "base64url"),
      );
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const session = sessionSchema.parse(
        JSON.parse(
          Buffer.concat([
            decipher.update(Buffer.from(encrypted, "base64url")),
            decipher.final(),
          ]).toString(),
        ),
      );
      return session.sessionExpiresAt > now() ? session : null;
    } catch {
      return null;
    }
  }
  function write(response: Response, session: Session | null) {
    const maxAge = session
      ? Math.max(0, Math.floor((session.sessionExpiresAt - now()) / 1000))
      : 0;
    response.headers.set(
      "Set-Cookie",
      `${cookieName}=${session ? seal(session) : ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
    );
    return response;
  }
  return { read, write, seal, cookieName };
}
