"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { completeOidcCallback } from "@/lib/oidc";
import type { BackendSession } from "@/lib/api/session";
import { fetchOnboarding } from "@/lib/api/management";
import { useOrganization } from "@/lib/organization-store";
import { AuthFrame } from "./AuthFrame";
import { Button, ButtonLink } from "@/components/ui/Button";

export function OidcCallback() {
  const router = useRouter();
  const { update } = useOrganization();
  // 계정 전환 시 Query 캐시가 비워지므로 단회 인증 왕복은 조회 캐시 밖에서 완료한다.
  const [login, setLogin] = useState<{
    user?: BackendSession["user"];
    error?: Error;
  }>({});
  const attempt = useRef({});
  useEffect(() => {
    let active = true;
    completeOidcCallback(attempt.current).then(
      (user) => {
        if (active) setLogin({ user });
      },
      (error) => {
        if (active)
          setLogin({
            error:
              error instanceof Error
                ? error
                : new Error("로그인을 완료하지 못했습니다."),
          });
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const user = login.user;
  const onboarding = useQuery({
    queryKey: ["oidc-onboarding", user?.organizationId],
    queryFn: () => fetchOnboarding(user!.organizationId),
    enabled: !!user,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!user || !onboarding.data) return;
    update((previous) => ({
      ...previous,
      session: {
        email: user.email,
        name: user.displayName ?? user.email,
        organizationId: user.organizationId,
      },
    }));
    router.replace(onboarding.data.completed ? "/overview" : "/onboarding");
  }, [user, onboarding.data, router, update]);
  const error = login.error ?? onboarding.error;
  return (
    <AuthFrame
      title={error ? "로그인을 완료하지 못했습니다" : "회사 계정 확인 중"}
    >
      {error ? (
        <>
          <p role="alert" className="text-sm">
            {error.message}
          </p>
          {user && onboarding.isError && (
            <Button
              onClick={() => void onboarding.refetch()}
              loading={onboarding.isFetching}
            >
              온보딩 상태 다시 확인
            </Button>
          )}
          <ButtonLink href="/login">다시 로그인</ButtonLink>
          <p className="text-xs text-text2">
            계속 실패하면 조직 관리자에게 계정 등록과 접근 권한을 확인해 주세요.
          </p>
        </>
      ) : (
        <p role="status" className="text-sm">
          인증 결과와 회사 접근 권한을 확인하고 있습니다…
        </p>
      )}
    </AuthFrame>
  );
}
