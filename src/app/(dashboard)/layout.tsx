import { RouteGuard } from "@/components/auth/RouteGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { FiltersProvider } from "@/lib/filters";
import { MotionProvider } from "@/components/ui/MotionProvider";

import { connection } from "next/server";
import { currentDateIso } from "@/lib/date";
import { DashboardHeaderProvider } from "@/components/layout/DashboardHeader";

/** 페이지 이동 중에도 공통 헤더·조직 수집 현황·기간 선택을 유지한다. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const todayIso = currentDateIso();
  return (
    <RouteGuard><FiltersProvider todayIso={todayIso}>
      <MotionProvider>
        <div className="relative flex h-dvh w-dvw items-stretch overflow-hidden bg-bg text-text">
          <Sidebar />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto @container">
            <DashboardHeaderProvider todayIso={todayIso}>{children}</DashboardHeaderProvider>
          </main>
        </div>
      </MotionProvider>
    </FiltersProvider></RouteGuard>
  );
}
