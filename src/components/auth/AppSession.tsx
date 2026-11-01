"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AuthError,
  backendLogout,
  getSessionState,
  invalidateBackendSessionCheck,
  restoreBackendSession,
  useBackendSession,
  useSessionState,
} from "@/lib/api/session";
import { onboardingOptions } from "@/lib/api/management";
import { routeAccess } from "@/lib/route-access";
import {
  afterLoginHref,
  loginHref,
  safeRedirectUrl,
} from "@/lib/auth-redirect";
import { useOrganization } from "@/lib/organization-store";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SessionSkeleton } from "./SessionSkeleton";

/** 앱 전체에서 최초 세션 복원과 생명주기를 관리한다. 페이지 이동은 재조회하지 않는다. */
export function AppSession({ children }: { children: ReactNode }) {
  const path = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const client = useQueryClient();
  const auth = useSessionState();
  const session = useBackendSession();
  const { reset } = useOrganization();
  const access = routeAccess(path);
  const managed = access !== "public";
  const expired = auth.status === "anonymous" && auth.reason === "expired";
  const [logoutError, setLogoutError] = useState<Error>();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!managed) return;
    // 캐시된 사용자 상태가 있으면 복원 함수는 요청을 보내지 않는다.
    void restoreBackendSession().catch(() => undefined);
    const recheck = () => {
      const state = getSessionState();
      if (state.status === "anonymous" && state.reason === "expired") return;
      void restoreBackendSession(true)
        .then(() => {
          const latest = getSessionState();
          if (latest.status !== "authenticated") return;
          const options = onboardingOptions(latest.session.user.organizationId);
          // 완료 상태는 변경 시 무효화한다. 미완료 상태만 다른 탭의 완료를 확인한다.
          if (
            client.getQueryData<{ completed: boolean }>(options.queryKey)
              ?.completed === false
          )
            void client.invalidateQueries({
              queryKey: options.queryKey,
              exact: true,
            });
        })
        .catch(() => undefined);
    };
    const invalidate = () => {
      const state = getSessionState();
      if (!(state.status === "anonymous" && state.reason === "expired"))
        invalidateBackendSessionCheck();
    };
    const visibility = () => {
      invalidate();
      if (document.visibilityState === "visible") recheck();
    };
    const hide = (event: PageTransitionEvent) => {
      if (event.persisted) invalidate();
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) {
        invalidate();
        recheck();
      }
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, [managed, client]);

  const onboarding = useQuery({
    ...onboardingOptions(session?.user.organizationId ?? ""),
    enabled: managed && !!session && auth.status !== "error" && !expired,
    retry: false,
    networkMode: "always",
  });
  const error = auth.status === "error" ? auth.error : onboarding.error;
  const forbidden =
    error instanceof AuthError
      ? error.status === 403
      : !!error && "status" in error && error.status === 403;
  useEffect(() => {
    if (forbidden) reset();
  }, [forbidden, reset]);
  const currentPath = `${path}${search.size ? `?${search}` : ""}${typeof window === "undefined" ? "" : window.location.hash}`;
  const returnTo = safeRedirectUrl(search.get("redirecturl"));
  let destination: string | null = null;
  if (managed && !error && !expired) {
    if (auth.status === "anonymous" && access !== "guest")
      destination = loginHref(currentPath);
    else if (session && onboarding.data) {
      if (!onboarding.data.completed && access !== "onboarding")
        destination = afterLoginHref(
          false,
          access === "protected" ? currentPath : returnTo,
        );
      else if (
        onboarding.data.completed &&
        ["guest", "entry", "onboarding"].includes(access)
      )
        destination = afterLoginHref(true, returnTo);
    }
  }
  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (!managed) return children;
  // 로그인은 만료 안내나 조회 장애로 막지 않는다. 정상 세션은 위에서 목적지로 이동한다.
  if (access === "guest" && (!session || error)) return children;
  if (expired)
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <section
          aria-labelledby="session-expired-title"
          className="flex max-w-md flex-col gap-4"
        >
          <h1 id="session-expired-title" className="text-xl font-semibold">
            세션이 만료되었습니다
          </h1>
          <p role="alert">
            다시 로그인해 주세요. 로그인 후 원래 페이지로 돌아갑니다.
          </p>
          <ButtonLink href={loginHref(currentPath)}>
            로그인 페이지로 이동
          </ButtonLink>
        </section>
      </div>
    );
  if (error)
    return (
      <div className="flex min-h-dvh items-center justify-center p-8">
        <div className="flex max-w-md flex-col gap-4 text-sm">
          <ErrorState
            message={
              forbidden
                ? "이 화면에 접근할 권한이 없습니다. 조직 관리자에게 문의해 주세요."
                : error.message
            }
            onRetry={() => {
              void (
                auth.status === "error"
                  ? restoreBackendSession(true)
                  : onboarding.refetch()
              ).catch(() => undefined);
            }}
            retryLabel="다시 시도"
          />
          <ButtonLink href={loginHref(currentPath)}>
            로그인 페이지로 이동
          </ButtonLink>
          {forbidden && (
            <Button
              loading={loggingOut}
              loadingLabel="로그아웃 중…"
              onClick={() => {
                setLoggingOut(true);
                setLogoutError(undefined);
                void backendLogout()
                  .then(
                    () => router.replace("/login"),
                    (cause) => setLogoutError(cause),
                  )
                  .finally(() => setLoggingOut(false));
              }}
            >
              로그아웃
            </Button>
          )}
          {logoutError && <p role="alert">{logoutError.message}</p>}
          <ButtonLink href="/contact">관리자에게 문의</ButtonLink>
        </div>
      </div>
    );
  if (destination || !session || !onboarding.data)
    return <SessionSkeleton path={path} />;
  return (
    <div
      key={`${session.user.organizationId}:${session.user.memberId}:${session.user.role}`}
      className="contents"
    >
      {children}
    </div>
  );
}
