import { Scenarios } from './pages/scenarios/Scenarios';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AuthProvider } from './app/auth';
import { Shell, Login, PlannedPage, pages } from './app/Shell';
import { mockMode } from './api/client';
const History = lazy(() =>
  import('./pages/scenarios/Reports').then((m) => ({ default: m.History })),
);
const RunReport = lazy(() =>
  import('./pages/scenarios/Reports').then((m) => ({ default: m.RunReport })),
);
const Operations = lazy(() =>
  import('./pages/operations/Operations').then((m) => ({ default: m.Operations })),
);
const Settings = lazy(() =>
  import('./pages/settings/Settings').then((m) => ({ default: m.Settings })),
);
const Overview = lazy(() =>
  import('./pages/overview/Overview').then((m) => ({ default: m.Overview })),
);
const Teams = lazy(() => import('./pages/teams/Teams').then((m) => ({ default: m.Teams })));
const Preview = lazy(() => import('./ComponentPreview').then((m) => ({ default: m.App })));
const ApiPreview = lazy(() => import('./dev/ApiPreview').then((m) => ({ default: m.ApiPreview })));
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60000, refetchOnWindowFocus: false } },
});
function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title =
      pages.find((page) => page.path === pathname)?.name ||
      (pathname === '/login'
        ? '로그인'
        : pathname === '/scenarios/history'
          ? '실행 이력 · 저장 리포트'
          : pathname.startsWith('/runs/')
            ? '시나리오 결과'
            : pathname === '/dev/components'
              ? '디자인 시스템'
              : pathname === '/dev/api'
                ? 'API 검사'
                : '페이지를 찾을 수 없습니다');
    document.title = `${title} · Pulsemetry`;
  }, [pathname]);
  return null;
}
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PageTitle />
        <AuthProvider>
          <Tooltip.Provider delayDuration={200}>
            <div className="small-screen">
              <h1>Pulsemetry</h1>
              <p>768px 이상의 화면에서 이용해 주세요.</p>
            </div>
            <div className="supported-screen">
              <Suspense fallback={<p role="status">불러오는 중…</p>}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/dev/components" element={<Preview />} />
                  <Route element={<Shell />}>
                    {pages.map((p) => (
                      <Route
                        key={p.path}
                        path={p.path}
                        element={
                          p.path === '/scenarios' ? (
                            <Scenarios />
                          ) : p.path === '/operations' ? (
                            <Operations />
                          ) : p.path === '/settings' ? (
                            <Settings />
                          ) : p.path === '/teams' ? (
                            <Teams />
                          ) : p.path === '/' ? (
                            <Overview />
                          ) : (
                            <PlannedPage />
                          )
                        }
                      />
                    ))}
                    <Route path="/runs/:runId" element={<RunReport />} />
                    <Route path="/scenarios/history" element={<History />} />
                    {mockMode && <Route path="/dev/api" element={<ApiPreview />} />}
                    <Route path="*" element={<PlannedPage />} />
                  </Route>
                </Routes>
              </Suspense>
            </div>
          </Tooltip.Provider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
