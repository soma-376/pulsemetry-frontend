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
import {
  Skeleton,
  SkeletonRegion,
  SkeletonRows,
} from "@/components/ui/Skeleton";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { TeamsSkeleton } from "@/components/teams/TeamsSkeleton";
import { MembersSkeleton } from "@/components/members/MembersSkeleton";
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton";
import { PerformanceSkeleton } from "@/components/performance/PerformanceSkeleton";
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
      // 같은 창의 탭 전환은 window focus 없이 일어난다. 확인 결과를
      // 무효화하고 복귀 시 백그라운드에서 현재 쿠키를 다시 확인한다.
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
  // 세션 확인 장애가 로그인 폼까지 막아 복구 경로를 없애지 않게 한다.
  // 보호 화면의 접근 판정과 기존 세션은 그대로 유지한다.
  const guestError = access === "guest" && !!error;
  const allowed = (ready && !destination) || guestError;
  const forbidden =
    (error instanceof AuthError && error.status === 403) ||
    (!!error && "status" in error && error.status === 403);
  useEffect(() => {
    // 권한 거부로 하위 화면을 해제할 때 메모리 초안도 다시 나타나지 않게 한다.
    if (forbidden) resetOrganization();
  }, [forbidden, resetOrganization]);
  // 같은 신원의 재확인은 기존 화면·입력을 유지한다. 계정 변경·거부 시에는 해제한다.
  const preserve =
    !!check &&
    !error &&
    !check.error &&
    ((!!identity &&
      check.identity === identity &&
      auth.status !== "anonymous") ||
      (access === "guest" &&
        check.path === path &&
        !check.identity &&
        !check.error &&
        (auth.status === "checking" || auth.status === "anonymous")));
  const showContent =
    allowed ||
    (preserve &&
      !destination &&
      routeDestination(access, !!identity, check.completed) === null);
  return (
    <>
      {!showContent && error && (
        <div className="flex min-h-dvh w-full items-center justify-center p-8">
          <div className="flex max-w-md flex-col gap-4 text-sm">
            <ErrorState
              message={
                forbidden
                  ? "이 화면에 접근할 권한이 없습니다. 조직 관리자에게 문의해 주세요."
                  : error.message
              }
              onRetry={() => setAttempt((value) => value + 1)}
              retryLabel="다시 시도"
            />
            {access !== "guest" && (
              <ButtonLink href="/login">로그인 페이지로 이동</ButtonLink>
            )}
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
          </div>
        </div>
      )}
      {!showContent && !error && <RouteSkeleton path={path} />}
      {showContent && <div className="contents">{children}</div>}
    </>
  );
}

/** 최초 확인·계정 전환에는 사용자 데이터 없이 기존 페이지 스켈레톤만 표시한다. */
function RouteSkeleton({ path }: { path: string }) {
  const root = path.split("/")[1];
  const pages: Record<string, { title: string; body: ReactNode }> = {
    overview: { title: "개요", body: <OverviewSkeleton /> },
    teams: { title: "팀 분석", body: <TeamsSkeleton /> },
    members: { title: "구성원", body: <MembersSkeleton /> },
    settings: { title: "설정", body: <SettingsSkeleton /> },
    ops: { title: "성과", body: <PerformanceSkeleton /> },
  };
  const page = pages[root];
  return (
    <div className="min-h-dvh w-full bg-bg p-6 text-text @container">
      {page ? (
        <>
          <h1 className="mb-6 text-[22px] font-semibold">{page.title}</h1>
          {page.body}
        </>
      ) : (
        <SkeletonRegion
          message="화면을 불러오는 중입니다…"
          className="mx-auto max-w-xl"
        >
          <Skeleton className="mb-6 h-7 w-40" />
          <SkeletonRows />
        </SkeletonRegion>
      )}
    </div>
  );
}
