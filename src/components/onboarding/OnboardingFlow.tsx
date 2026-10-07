"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CollectionStep } from "./CollectionStep";
import { ContractsStep } from "./ContractsStep";
import { TeamSetupStep } from "./TeamSetupStep";
import { useOrganization } from "@/lib/organization-store";
import { completeOnboarding, hasSavedContract } from "@/lib/organization";
import { AUTH_SEED } from "@/mocks/auth";

const steps = [
  { key: "collection", label: "수집 정책", title: "프롬프트 원문 수집 여부를 선택하세요" },
  { key: "contracts", label: "계약 입력", title: "사용 중인 도구의 계약을 등록하세요" },
  { key: "team", label: "팀·초대", title: "팀을 구성하고 구성원을 초대하세요", optional: true },
] as const;

export function OnboardingFlow() {
  const { state, update } = useOrganization();
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const index = steps.findIndex((step) => step.key === state.onboardingStep);
  const current = steps[index];
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, [index]);
  const canAdvance = index === 0 ? state.promptRaw !== null : hasSavedContract(state);
  const finish = () => {
    const next = completeOnboarding(state);
    if (!next.onboardingCompleted) return;
    update(() => next);
    router.replace("/overview");
  };
  return <div className="min-h-dvh bg-bg px-5 py-6 text-text sm:px-8 sm:py-8">
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3"><span className="text-sm font-semibold">Pulsemetry</span><div className="flex items-center gap-3"><ButtonLink href="/login" onClick={() => update((previous) => ({ ...previous, session: null }))}>로그아웃</ButtonLink><ThemeToggle /></div></header>
    <main className="mx-auto my-10 flex w-full max-w-2xl flex-col gap-8">
      <div><p className="text-xs text-text3">{AUTH_SEED.organizationName} · 처음 시작하기</p><h1 ref={heading} tabIndex={-1} className="mt-3 text-xl font-semibold tracking-tight outline-none">{current.title}</h1><p className="mt-2 text-xs text-text3">필수 설정 2단계 · 팀 구성·구성원 초대는 선택</p></div>
      <ol aria-label="온보딩 진행 단계" className="grid grid-cols-3 gap-3">{steps.map((step, i) => <li key={step.key} aria-current={index === i ? "step" : undefined} className={`border-t-2 pt-3 text-xs ${i <= index ? "border-text text-text" : "border-border text-text3"}`}><span className="mr-1.5">{i < index ? "✓" : i + 1}</span>{step.label}{step.key === "team" && <span className="ml-1 text-text3">(선택)</span>}</li>)}</ol>
      {current.key === "collection" ? <CollectionStep /> : current.key === "contracts" ? <ContractsStep /> : <TeamSetupStep />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        {index > 0 ? <Button className="h-10 px-4" onClick={() => update((previous) => ({ ...previous, onboardingStep: steps[index - 1].key }))}>이전</Button> : <span />}
        {index < 2 ? <Button className="h-10 px-5" variant="primary" disabled={!canAdvance} onClick={() => update((previous) => ({ ...previous, onboardingStep: steps[index + 1].key }))}>다음</Button>
          : <div className="flex flex-wrap gap-2"><Button className="h-10" onClick={finish}>건너뛰고 시작</Button><Button className="h-10 px-5" variant="primary" onClick={finish}>완료</Button></div>}
      </div>
      <p className="text-center text-xs leading-5 text-text3">데모 환경 · 새로고침하면 입력한 내용과 진행 상태가 초기화됩니다.</p>
    </main>
  </div>;
}
