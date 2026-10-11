"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
import { routeAccess, routeDestination } from "@/lib/route-access";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button, ButtonLink } from "@/components/ui/Button";

type Check = {
  path: string;
  attempt: number;
  identity?: string;
  completed?: boolean;
  error?: Error;
};

/** 화면 표시만 제어한다. 실제 데이터 접근 권한은 BFF·backend가 매 요청마다 검증한다. */
export function RouteGuard({ children }: { children?: ReactNode }) {
  const path = usePathname(),
    router = useRouter(),
    client = useQueryClient();
  const auth = useSessionState(),
    session = useBackendSession();
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<Check>();
  const [logoutError, setLogoutError] = useState<Error>();
  const [loggingOut, setLoggingOut] = useState(false);
  const identity = session
    ? `${session.user.organizationId}:${session.user.memberId}:${session.user.role}`
    : undefined;
  const access = routeAccess(path);

  useEffect(() => {
    const focus = () => setAttempt((value) => value + 1);
    const pageHide = (event: PageTransitionEvent) => {
      if (event.persisted) invalidateBackendSessionCheck();
    };
    const pageShow = (event: PageTransitionEvent) => {
      // BFCache 복원은 pathname 변경·마운트·focus 없이 일어날 수 있다.
      if (!event.persisted) return;
      invalidateBackendSessionCheck();
      setAttempt((value) => value + 1);
    };
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      await restoreBackendSession(true);
      const state = getSessionState();
      if (state.status === "error") throw state.error;
      if (state.status !== "authenticated") {
        if (active) setCheck({ path, attempt });
        return;
      }
      const user = state.session.user;
      const onboarding = await client.fetchQuery({
        ...onboardingOptions(user.organizationId),
        staleTime: 0,
        retry: false,
        networkMode: "always",
      });
      // 로그아웃·계정 변경 중 도착한 이전 사용자 결과는 화면에 반영하지 않는다.
      if (active && getSessionState() === state)
        setCheck({
          path,
          attempt,
          identity: `${user.organizationId}:${user.memberId}:${user.role}`,
          completed: onboarding.completed,
        });
    };
    void verify().catch((error) => {
      if (active)
        setCheck({
          path,
          attempt,
          error:
            error instanceof Error
              ? error
              : new Error("접근 상태를 확인하지 못했습니다."),
        });
    });
    return () => {
      active = false;
    };
  }, [path, attempt, client]);

  const checked = check?.path === path && check.attempt === attempt;
  const error =
    auth.status === "error" ? auth.error : checked ? check.error : undefined;
  const ready =
    checked &&
    !error &&
    (auth.status === "anonymous" ||
      (auth.status === "authenticated" && check.identity === identity));
  const destination =
    auth.status === "anonymous" &&
    access !== "guest" &&
    (checked || !!check?.identity)
      ? "/login"
      : ready
        ? routeDestination(
            access,
            auth.status === "authenticated",
            check.completed,
          )
        : null;
  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);
  const allowed = ready && !destination;
  const forbidden =
    (error instanceof AuthError && error.status === 403) ||
    (!!error && "status" in error && error.status === 403);
  // 포커스 재확인 동안에는 입력 중인 하위 화면을 숨겨 보존한다. 계정 변경·거부 시에는 해제한다.
  const preserve =
    !!check &&
    !error &&
    ((!!identity &&
      check.identity === identity &&
      auth.status !== "anonymous") ||
      (access === "guest" &&
        check.path === path &&
        !check.identity &&
        !check.error &&
        (auth.status === "checking" || auth.status === "anonymous")));
  return (
    <>
      {!allowed && (
        <div className="flex min-h-dvh w-full items-center justify-center p-8">
          <div className="flex max-w-md flex-col gap-4 text-sm">
            {error ? (
              <>
                <ErrorState
                  message={
                    forbidden
                      ? "이 화면에 접근할 권한이 없습니다. 조직 관리자에게 문의해 주세요."
                      : error.message
                  }
                  onRetry={() => setAttempt((value) => value + 1)}
                  retryLabel="다시 시도"
                />
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
                          (error) => setLogoutError(error),
                        )
                        .finally(() => setLoggingOut(false));
                    }}
                  >
                    로그아웃
                  </Button>
                )}
                {logoutError && <p role="alert">{logoutError.message}</p>}
                <ButtonLink href="/contact">관리자에게 문의</ButtonLink>
              </>
            ) : (
              <LoadingState
                message={
                  destination
                    ? "페이지로 이동 중입니다…"
                    : "로그인 상태를 확인 중입니다…"
                }
              />
            )}
          </div>
        </div>
      )}
      {(allowed || preserve) && (
        <div hidden={!allowed} className={allowed ? "contents" : "hidden"}>
          {children}
        </div>
      )}
    </>
  );
}
