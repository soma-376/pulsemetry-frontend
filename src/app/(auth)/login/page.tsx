import type { Metadata } from "next";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "로그인 · Pulsemetry",
};

/**
 * P0 로그인 — 이번 범위에서는 셸과 라우트만 잡아둡니다.
 * 실제 화면(IdP 이동·미등록 도메인·권한 없음 3상태)은 P1 이후에 이식합니다.
 */
export default function LoginPage() {
  return (
    <>
      <div className="flex w-full max-w-[404px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[9px]">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--text)] text-[12px] font-bold text-[var(--card)]">
            P
          </span>
          <span className="text-[14px] font-semibold tracking-[-0.01em]">
            Pulsemetry
          </span>
        </div>
        <ThemeToggle />
      </div>

      <main className="flex w-full max-w-[404px] flex-col gap-4 rounded-lg border border-border bg-card px-6 pt-[26px] pb-[22px]">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">로그인</h1>
        <p className="pretty text-[12.5px] text-text2">
          등록된 도메인만 IdP로 연결됩니다 · 개인 계정 가입은 없습니다.
          <br />이 화면은 아직 이식 전입니다.
        </p>
        <ButtonLink href="/overview" variant="primary" className="h-10">
          대시보드로 이동
        </ButtonLink>
      </main>
    </>
  );
}
