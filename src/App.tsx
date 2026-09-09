import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AuthProvider } from './app/auth';
import { Shell, Login, PlannedPage, pages } from './app/Shell';
import { mockMode } from './api/client';
const Preview = lazy(() => import('./ComponentPreview').then((m) => ({ default: m.App })));
const ApiPreview = lazy(() => import('./dev/ApiPreview').then((m) => ({ default: m.ApiPreview })));
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60000, refetchOnWindowFocus: false } },
});
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
                      <Route key={p.path} path={p.path} element={<PlannedPage />} />
                    ))}
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
