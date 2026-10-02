"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthFrame } from "./AuthFrame";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { loginSchema, type LoginForm } from "@/lib/schemas/auth";
import { ownerMailto, type DemoLoginResult, type LoginView } from "@/lib/auth";
import { fetchOnboarding, onboardingOptions } from "@/lib/api/management";
import { AuthError, seedLogin } from "@/lib/api/session";
import { useOrganization } from "@/lib/organization-store";
import { useRateLimit } from "@/lib/use-rate-limit";

/**
 * 회사 계정 로그인. `demo`는 목 모드(브라우저 목 테스트)에서만 켠다 — 회사 로그인 결과를 고르는 데모 시나리오와 데모 관리자 연락처는
 * 실제 조직의 것이 아니므로 실서버 모드에서는 보이지 않는다.
 */
export function LoginCard({ demo = false }: { demo?: boolean }) {
  const { update } = useOrganization();
  const router = useRouter();
  const client = useQueryClient();
  const [view, setView] = useState<LoginView>("form");
  const [scenario, setScenario] = useState<DemoLoginResult>("success");
  const [error, setError] = useState("");
  const limit = useRateLimit();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema), defaultValues: { email: "" },
  });
  const submit = async (values: LoginForm) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (controller.signal.aborted) return;
    if (scenario === "network") { setError("로그인 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."); return; }
    if (scenario === "denied") { setView("denied"); return; }
    if (scenario === "cancelled" || scenario === "configuration") {
      setError(scenario === "cancelled" ? "회사 계정 로그인이 취소되었습니다." : "회사 로그인 연결을 확인할 수 없습니다. 조직 관리자에게 문의해 주세요.");
      setView("error"); return;
    }
    setView("redirect");
    try {
      const user = await seedLogin(values.email, controller.signal);
      if (controller.signal.aborted) return;
      update((previous) => ({ ...previous, session: { email: user.email, name: user.displayName ?? user.email, organizationId: user.organizationId } }));
      const onboarding = await fetchOnboarding(user.organizationId, controller.signal);
      if (!controller.signal.aborted) {
        client.setQueryData(onboardingOptions(user.organizationId).queryKey, onboarding);
        router.replace(onboarding.completed ? "/overview" : "/onboarding");
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AuthError && cause.status === 400) { setView("unknown"); return; }
      // 요청 제한은 계정·서버 설정 오류가 아니다. 입력한 이메일을 그대로 두고 대기 뒤 다시 보낼 수 있게 한다.
      if (limit.capture(cause)) { setView("form"); return; }
      setError(cause instanceof Error ? cause.message : "로그인에 실패했습니다.");
      setView("error");
    }
  };
  const retry = () => { request.current?.abort(); setView("form"); setError(""); };
  return <AuthFrame title={view === "denied" ? "접근 권한이 없습니다" : "회사 계정으로 로그인"}>
    {(view === "form" || view === "unknown") && <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">회사 이메일
        <Input {...register("email", { onChange: () => { setView("form"); setError(""); } })} type="email" autoComplete="email" placeholder="you@company.com" className="h-10" disabled={isSubmitting} aria-invalid={!!errors.email || view === "unknown"} aria-describedby="login-message" />
      </label>
      <div id="login-message" aria-live="polite" className="text-xs text-red">
        {errors.email?.message || limit.message || error || (view === "unknown" ? "등록된 조직을 찾지 못했습니다. 이메일을 확인하거나 조직 관리자에게 초대를 요청해 주세요." : "")}
      </div>
      <Button type="submit" variant="primary" className="h-10" disabled={isSubmitting || limit.waiting}>{limit.waiting ? `${limit.seconds}초 뒤 다시 시도` : isSubmitting ? "로그인 방법 확인 중…" : "회사 계정으로 계속"}</Button>
    </form>}
    {view === "redirect" && <>
      <div role="status" className="rounded-lg bg-sub p-4 text-sm"><p className="font-semibold">회사 계정으로 로그인 중</p><p className="mt-2 break-all text-text2">{getValues("email")}</p></div>

      <Button onClick={retry}>다른 이메일로 로그인</Button>
    </>}
    {(view === "denied" || view === "error") && <>
      <p role="alert" className="text-sm leading-6">{view === "denied" ? "로그인은 완료했지만 이 조직에 접근할 권한이 없습니다. 관리자에게 초대와 역할을 확인해 주세요." : error}</p>
      <Button onClick={retry}>다시 시도</Button>
      {demo && <ButtonLink href={ownerMailto}>조직 관리자에게 문의</ButtonLink>}
    </>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-text2"><span>아직 도입 전인가요?</span><ButtonLink href="/contact">도입 문의</ButtonLink></div>
    {demo && <details className="text-xs text-text3"><summary className="cursor-pointer">데모 시나리오</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p>관리자: owner@seed-a.example.test<br />B·C 조직은 seed-b·seed-c 이메일을 사용합니다.</p>
        <label className="flex flex-col gap-1">회사 로그인 결과<Select value={scenario} disabled={isSubmitting} onChange={(event) => { setScenario(event.target.value as DemoLoginResult); retry(); }}>
          <option value="success">정상</option><option value="cancelled">사용자 취소</option><option value="configuration">연결 오류</option><option value="denied">권한 부족</option><option value="network">조회 실패</option>
        </Select></label>
      </div>
    </details>}
  </AuthFrame>;
}
