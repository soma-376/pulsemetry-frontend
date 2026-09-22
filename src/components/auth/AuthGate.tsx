"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useOrganization } from "@/lib/organization-store";

/** 프론트 목 화면 전환용. 실제 접근 제어는 서버 인증 도입 시 구현합니다. */
export function AuthGate({ children, onboarding = false }: { children: ReactNode; onboarding?: boolean }) {
  const { state } = useOrganization();
  const router = useRouter();
  const destination = !state.session ? "/login"
    : onboarding && state.onboardingCompleted ? "/overview"
    : !onboarding && !state.onboardingCompleted ? "/onboarding" : null;
  useEffect(() => { if (destination) router.replace(destination); }, [destination, router]);
  if (destination) return <p role="status" className="p-8 text-sm text-text3">화면을 준비하고 있습니다…</p>;
  return children;
}
