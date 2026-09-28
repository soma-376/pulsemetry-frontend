"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button, ButtonLink } from "@/components/ui/Button";
import { CollectionStep } from "./CollectionStep";
import { ContractsStep } from "./ContractsStep";
import { TeamSetupStep } from "./TeamSetupStep";
import { OnboardingProvider } from "./OnboardingProvider";
import { useOrganization } from "@/lib/organization-store";
import { backendLogout, useBackendSession } from "@/lib/api/session";
import { apiJson, createCommands, readOptions, ManagementError, managementKey, onboardingOptions, onboardingSchema, orgPath, policySavedSchema, type OnboardingState } from "@/lib/api/management";
import { EMPTY_TIER, type VendorDraft } from "@/lib/settings";

const steps = [
  { key: "collection", label: "수집 정책", title: "프롬프트 원문 수집 여부를 선택하세요" },
  { key: "vendors", label: "벤더 등록", title: "사용 중인 도구를 등록하세요" },
  { key: "team", label: "팀·초대", title: "팀을 구성하고 구성원을 초대하세요" },
] as const;
export function OnboardingFlow() {
  const session = useBackendSession();
  return <OnboardingProvider key={session?.user.organizationId ?? "anonymous"}>
    {session ? <OnboardingQuery organizationId={session.user.organizationId} /> : <div className="p-8 text-sm">온보딩을 저장하려면 <ButtonLink href="/login">로그인</ButtonLink>해 주세요.</div>}
  </OnboardingProvider>;
}
function OnboardingQuery({ organizationId }: { organizationId: string }) {
  const query = useQuery(onboardingOptions(organizationId));
  const router = useRouter();
  useEffect(() => { if (query.data?.completed) router.replace("/overview"); }, [query.data?.completed, router]);
  if (query.isPending) return <p role="status" className="p-8 text-sm">온보딩 설정을 불러오는 중입니다…</p>;
  if (query.isError && !query.data) return <div role="alert" className="p-8 text-sm">{query.error.message}<Button onClick={() => void query.refetch()}>다시 시도</Button><ButtonLink href="/login">로그인</ButtonLink></div>;
  if (query.data!.completed) return <p role="status" className="p-8 text-sm">개요로 이동합니다…</p>;
  return <>{query.error && <p role="alert" className="px-8 pt-4 text-sm text-red">{query.error.message}</p>}<OnboardingSteps organizationId={organizationId} server={query.data!} /></>;
}
function OnboardingSteps({ organizationId, server }: { organizationId: string; server: OnboardingState }) {
  const { update } = useOrganization();
  const router = useRouter();
  const session = useBackendSession();
  const client = useQueryClient();
  const [post] = useState(createCommands);
  const [index, setIndex] = useState(() => Math.max(0, steps.findIndex(step => step.key === server.nextStep)));
  const [promptRaw, setPromptRaw] = useState(server.policy.confirmed ? server.policy.collectRawContent : null);
  const [draft, setDraft] = useState<VendorDraft>({ kind: "", plan: null, tiers: [{ ...EMPTY_TIER }], term: "" });
  const [teamDraft, setTeamDraft] = useState("");
  const [childBusy, setChildBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const current = steps[index];
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, [index]);
  const policy = useMutation({ retry: readOptions.retry, retryDelay: readOptions.retryDelay,
    mutationFn: () => apiJson("enrollment", orgPath(organizationId, "/collection-policy"), policySavedSchema, { method: "PUT", body: JSON.stringify({ expectedVersion: server.policy.version, collectRawContent: promptRaw }) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: managementKey(organizationId, "onboarding") }); setIndex(1); },
    onError: async error => {
      await client.invalidateQueries({ queryKey: managementKey(organizationId, "onboarding") });
      if (error instanceof ManagementError && error.code === "version_conflict") {
        const latest = client.getQueryData<OnboardingState>(managementKey(organizationId, "onboarding"));
        if (latest) setPromptRaw(latest.policy.collectRawContent);
      }
    },
  });
  const complete = useMutation({ retry: readOptions.retry, retryDelay: readOptions.retryDelay,
    mutationFn: () => post(organizationId, "/onboarding/complete", {}, onboardingSchema),
    onSuccess: data => { client.setQueryData(managementKey(organizationId, "onboarding"), data); router.replace("/overview"); },
    onError: async () => { await client.invalidateQueries({ queryKey: managementKey(organizationId, "onboarding") }); },
  });
  const busy = childBusy || policy.isPending || complete.isPending;
  const canAdvance = index === 0 ? promptRaw !== null : server.selectedVendorCount > 0;
  return <div className="min-h-dvh bg-bg px-5 py-6 text-text sm:px-8 sm:py-8">
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3"><span className="text-sm font-semibold">Pulsemetry</span><div className="flex items-center gap-3"><ButtonLink href="/login" onClick={async event => { event.preventDefault(); if (busy) return; try { await backendLogout(); update(previous => ({ ...previous, session: null })); router.replace("/login"); } catch (cause) { setLogoutError(cause instanceof Error ? cause.message : "로그아웃에 실패했습니다."); } }}>로그아웃</ButtonLink><ThemeToggle /></div></header>
    <main className="mx-auto my-10 flex w-full max-w-2xl flex-col gap-8">
      {logoutError && <p role="alert" className="text-sm text-red">{logoutError}</p>}
      <div><p className="text-xs text-text3">{session?.user.organizationName} · 처음 시작하기</p><h1 ref={heading} tabIndex={-1} className="mt-3 text-xl font-semibold tracking-tight outline-none">{current.title}</h1><p className="mt-2 text-xs text-text3">필수 설정 2단계 · 팀 구성·구성원 초대는 선택</p></div>
      <ol aria-label="온보딩 진행 단계" className="grid grid-cols-3 gap-3">{steps.map((step, i) => <li key={step.key} aria-current={index === i ? "step" : undefined} className={`border-t-2 pt-3 text-xs ${i <= index ? "border-text text-text" : "border-border text-text3"}`}><span className="mr-1.5">{i < index ? "✓" : i + 1}</span>{step.label}{step.key === "team" && <span className="ml-1 text-text3">(선택)</span>}</li>)}</ol>
      {current.key === "collection" ? <fieldset disabled={busy}><CollectionStep value={promptRaw} onChange={setPromptRaw} /></fieldset> : current.key === "vendors" ? <ContractsStep organizationId={organizationId} draft={draft} onChange={setDraft} onBusy={setChildBusy} /> : <TeamSetupStep organizationId={organizationId} onBusy={setChildBusy} draft={teamDraft} onDraftChange={setTeamDraft} />}
      {(policy.error || complete.error) && <p role="alert" className="text-sm text-red">{(index === 0 ? policy.error : complete.error)?.message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        {index > 0 ? <Button className="h-10 px-4" disabled={busy} onClick={() => { policy.reset(); complete.reset(); setIndex(index - 1); }}>이전</Button> : <span />}
        {index < 2 ? <Button className="h-10 px-5" variant="primary" disabled={!canAdvance || busy} onClick={() => { if (index === 0) policy.mutate(); else setIndex(2); }}>{policy.isPending ? "저장 중…" : "다음"}</Button>
          : <div className="flex flex-wrap gap-2"><Button className="h-10" disabled={busy || !server.canComplete} onClick={() => complete.mutate()}>건너뛰고 시작</Button><Button className="h-10 px-5" variant="primary" disabled={busy || !server.canComplete} onClick={() => complete.mutate()}>{complete.isPending ? "저장 중…" : "완료"}</Button></div>}
      </div>
      <p className="text-center text-xs leading-5 text-text3">저장한 설정은 유지됩니다. 아직 저장하지 않은 입력은 새로고침하면 초기화됩니다.</p>
    </main>
  </div>;
}
