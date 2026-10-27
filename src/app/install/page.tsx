import type { Metadata } from "next";
import { headers } from "next/headers";
import { InstallGuide } from "@/components/install/InstallGuide";
import { detectInstallPlatform, parseInstallCode } from "@/lib/install-guide";

export const metadata: Metadata = {
  title: "에이전트 설치 · Pulsemetry",
  robots: { index: false, follow: false },
};

/**
 * 초대 메일에서 여는 공개 설치 안내. 세션·BFF를 거치지 않고 서버도 호출하지 않는다.
 * 코드 유효성(만료·사용 여부)은 설치 명령을 실행할 때 enroll이 판단한다.
 */
export default async function InstallPage({
  searchParams,
}: PageProps<"/install">) {
  const parsed = parseInstallCode((await searchParams).code);
  const requestHeaders = await headers();
  const platform = detectInstallPlatform(
    requestHeaders.get("user-agent"),
    requestHeaders.get("sec-ch-ua-platform"),
  );
  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-5 pt-14 pb-10 text-text">
      <div className="flex w-full max-w-[600px] flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div aria-hidden="true" className="h-5 w-5 rounded-[5px] bg-blue" />
            <span className="text-sm font-semibold">Pulsemetry</span>
          </div>
          {parsed.kind === "ok" && (
            <span className="tnum min-w-0 text-xs [overflow-wrap:anywhere] text-text3">
              초대 코드 {parsed.code}
            </span>
          )}
        </header>

        <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">
          에이전트 설치
        </h1>

        <main className="flex flex-col gap-6">
          {parsed.kind === "ok" ? (
            <InstallGuide
              code={parsed.code}
              serverUrl={
                process.env.NEXT_PUBLIC_ENROLLMENT_API_URL ??
                "http://localhost:8080"
              }
              detectedPlatform={platform}
            />
          ) : (
            <section
              role="alert"
              className="flex flex-col items-center gap-3 rounded-[10px] border border-border bg-card px-6 py-8 text-center"
            >
              <span className="text-[15px] font-semibold">
                {parsed.kind === "missing"
                  ? "설치 링크에 초대 코드가 없습니다."
                  : "초대 코드 형식이 올바르지 않습니다."}
              </span>
              <span className="text-[12.5px] text-text3">
                초대 메일의 설치 링크를 다시 열어 주세요. 계속 열리지 않으면
                관리자에게 새 코드를 요청하세요.
              </span>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
