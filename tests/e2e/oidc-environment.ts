/** 실제 IdP E2E 전용. 앱 설정·번들에는 포함하지 않는다. 비밀번호 기본값은 없다. */
export function oidcOrigin(
  environment: Record<string, string | undefined> = process.env,
): string {
  const value = environment.E2E_OIDC_ORIGIN;
  if (!value)
    throw new Error("실제 IdP 테스트에는 E2E_OIDC_ORIGIN이 필요합니다.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "E2E_OIDC_ORIGIN은 경로·인증 정보 없는 HTTPS origin이어야 합니다.",
    );
  return url.origin;
}

export function oidcPassword(
  email: string,
  environment: Record<string, string | undefined> = process.env,
): string {
  let passwords: unknown;
  try {
    passwords = JSON.parse(environment.E2E_OIDC_PASSWORDS_JSON ?? "{}");
  } catch {
    throw new Error("E2E_OIDC_PASSWORDS_JSON 형식을 확인하세요.");
  }
  const password =
    passwords && typeof passwords === "object"
      ? (passwords as Record<string, unknown>)[email]
      : undefined;
  if (typeof password !== "string" || !password)
    throw new Error("E2E 계정별 비밀번호를 테스트 프로세스에 주입하세요.");
  return password;
}
