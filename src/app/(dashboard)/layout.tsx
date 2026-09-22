import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGate } from "@/components/auth/AuthGate";
import { FiltersProvider } from "@/lib/filters";
import { MotionProvider } from "@/components/ui/MotionProvider";

/**
 * 대시보드 셸 — 인증을 통과한 화면들이 공유합니다.
 *
 * 사이드바와 전역 필터를 여기서 한 번만 선언하므로 페이지를 옮겨다녀도
 * 접힘 상태·선택한 기간이 유지됩니다. 실제 세션 가드가 붙을 자리도 여기입니다.
 *
 * 필터 툴바는 이 레이아웃이 아니라 각 페이지가 얹습니다 —
 * 설정 화면처럼 기간 필터가 무의미한 페이지가 있기 때문입니다.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate><FiltersProvider>
      <MotionProvider>
        <div className="relative flex h-dvh w-dvw items-stretch overflow-hidden bg-bg text-text">
          <Sidebar />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto @container">
            {children}
          </main>
        </div>
      </MotionProvider>
    </FiltersProvider></AuthGate>
  );
}
