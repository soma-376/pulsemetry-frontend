"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AuthError,
  backendLogout,
  getBackendSessionGeneration,
  getSessionState,
  invalidateBackendSessionCheck,
  restoreBackendSession,
  subscribeBackendIdentityChange,
  useBackendSession,
  useSessionState,
} from "@/lib/api/session";
import { onboardingOptions } from "@/lib/api/management";
import { routeAccess, routeDestination } from "@/lib/route-access";
import { useOrganization } from "@/lib/organization-store";
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
  const { reset: resetOrganization } = useOrganization();
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<Check>();
  const [logoutError, setLogoutError] = useState<Error>();
  const [loggingOut, setLoggingOut] = useState(false);
  const hasVerifiedSession = useRef(false);
  const identity = session
    ? `${session.user.organizationId}:${session.user.memberId}:${session.user.role}`
    : undefined;
  const access = routeAccess(path);

  useEffect(() => {
    const focus = () => setAttempt((value) => value + 1);
    const visibility = () => {
      // 같은 창의 탭 전환은 window focus 없이 일어난다. 숨겨질 때부터
      // 이전 화면을 가리고, 다시 보이면 현재 쿠키로 확인한 뒤 복구한다.
      invalidateBackendSessionCheck();
      if (document.visibilityState === "visible") focus();
    };
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
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    return () => {
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
    };
  }, []);

  // 첫 복원은 이 가드의 확인이 처리한다. 이후 계정 변경·익명 전환은
  // 완료된 check가 없어도 재확인하고, 한 렌더 사이의 A→B→A도 놓치지 않는다.
  useEffect(
    () =>
      subscribeBackendIdentityChange(() => {
        if (hasVerifiedSession.current) setAttempt((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    let verificationGeneration = getBackendSessionGeneration();
    const verify = async () => {
      await restoreBackendSession(true);
      const state = getSessionState();
      // 숨김으로 무효화된 이전 요청이 끝나도 보존 중인 입력을 지우지 않는다.
      if (!active || state.status === "checking") return;
      if (state.status === "error") throw state.error;
      hasVerifiedSession.current = true;
      if (state.status !== "authenticated") {
        if (active) setCheck({ path, attempt });
        return;
      }
      // 최초 복원은 null→사용자로 세대가 바뀔 수 있다. 확인한 사용자부터
      // 온보딩 결과의 유효 세대를 잡고, 이후 숨김·로그아웃·변경은 폐기한다.
      verificationGeneration = getBackendSessionGeneration();
      const user = state.session.user;
      const verifiedIdentity = `${user.organizationId}:${user.memberId}:${user.role}`;
      const onboarding = await client.fetchQuery({
        ...onboardingOptions(user.organizationId),
        staleTime: 0,
        retry: false,
        networkMode: "always",
      });
      if (!active || getBackendSessionGeneration() !== verificationGeneration)
        return;
      // 같은 계정의 업무 401 재확인이 아직 진행 중이면 그 결과에 합류한다.
      // 이미 복원된 세션은 재조회하지 않으며, 무효화된 세대는 여기 오지 않는다.
      await restoreBackendSession();
      const latest = getSessionState();
      if (
        active &&
        getBackendSessionGeneration() === verificationGeneration &&
        latest.status === "authenticated" &&
        `${latest.session.user.organizationId}:${latest.session.user.memberId}:${latest.session.user.role}` ===
          verifiedIdentity
      )
        setCheck({
          path,
          attempt,
          identity: verifiedIdentity,
          completed: onboarding.completed,
        });
    };
    void verify().catch((error) => {
      if (
        active &&
        getBackendSessionGeneration() === verificationGeneration &&
        getSessionState().status !== "checking"
      )
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
  useEffect(() => {
    // 권한 거부로 하위 화면을 해제할 때 메모리 초안도 다시 나타나지 않게 한다.
    if (forbidden) resetOrganization();
  }, [forbidden, resetOrganization]);
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
