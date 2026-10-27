/**
 * 설치 안내 페이지(/install?code=)가 쓰는 순수 함수.
 * 코드 규칙과 명령 형식은 enrollment-api의 InvitationCode·InvitationAdminService·BusinessMail과 같아야 한다.
 */

/** Crockford Base32 4자 × 3묶음. I·L·O·U는 쓰지 않는다. */
const CODE_PATTERN =
  /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export type InstallCode =
  { kind: "ok"; code: string } | { kind: "missing" } | { kind: "invalid" };

/**
 * 서버의 InvitationCode.normalize와 같은 순서로 맞춘다: 앞뒤 공백 제거 → 대문자 → 하이픈이 없으면 4자마다 삽입.
 * 부트스트랩 엔드포인트(/unix, /windows)는 정규화 없이 형식만 보므로 명령에는 정규화한 값을 넣어야 한다.
 */
export function parseInstallCode(
  raw: string | string[] | undefined,
): InstallCode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim().toUpperCase() ?? "";
  if (!trimmed) return { kind: "missing" };
  const hyphenated = trimmed.includes("-")
    ? trimmed
    : (trimmed.match(/.{1,4}/g) ?? []).join("-");
  return CODE_PATTERN.test(hyphenated)
    ? { kind: "ok", code: hyphenated }
    : { kind: "invalid" };
}

export type InstallPlatform = "macos" | "linux" | "windows";

export type InstallPlatformInfo = {
  value: InstallPlatform;
  label: string;
  shell: string;
  prompt: string;
  /** 부트스트랩 스크립트(install.sh·install.ps1)가 바이너리를 두는 위치 */
  installPath: string;
};

export const INSTALL_PLATFORMS: InstallPlatformInfo[] = [
  {
    value: "macos",
    label: "macOS",
    shell: "터미널",
    prompt: "$",
    installPath: "~/.pulsemetry/bin/pulsemetry",
  },
  {
    value: "windows",
    label: "Windows",
    shell: "PowerShell",
    prompt: "PS>",
    installPath: "%LOCALAPPDATA%\\Pulsemetry\\bin\\pulsemetry.exe",
  },
  {
    value: "linux",
    label: "Linux",
    shell: "셸",
    prompt: "$",
    installPath: "~/.pulsemetry/bin/pulsemetry",
  },
];

/** Sec-CH-UA-Platform을 먼저 보고, 없으면 User-Agent로 추정한다. 알 수 없으면 macOS. */
export function detectInstallPlatform(
  userAgent: string | null,
  platformHint: string | null,
): InstallPlatform {
  const hint = platformHint?.replaceAll('"', "").toLowerCase() ?? "";
  if (hint === "windows") return "windows";
  if (hint === "macos") return "macos";
  if (hint === "linux" || hint === "chrome os") return "linux";
  const ua = userAgent?.toLowerCase() ?? "";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macos";
  if (ua.includes("linux") || ua.includes("x11") || ua.includes("cros"))
    return "linux";
  return "macos";
}

/** 초대 메일과 같은 한 줄 명령. 부트스트랩 스크립트가 바이너리를 받고 enroll --invite까지 실행한다. */
export function installCommand(
  platform: InstallPlatform,
  code: string,
  serverUrl: string,
): string {
  const base = serverUrl.replace(/\/+$/, "");
  return platform === "windows"
    ? `irm '${base}/windows?code=${code}' | iex`
    : `curl -fsSL '${base}/unix?code=${code}' | sh`;
}
