"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthFrame } from "./AuthFrame";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { loginSchema, type LoginForm } from "@/lib/schemas/auth";
import { resolveDemoLogin, resolveDemoAdmin, ownerMailto, type DemoLoginResult, type LoginView } from "@/lib/auth";
import { useOrganization } from "@/lib/organization-store";

export function LoginCard() {
  const { state, update } = useOrganization();
  const router = useRouter();
  const [view, setView] = useState<LoginView>("form");
  const [scenario, setScenario] = useState<DemoLoginResult>("success");
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");
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
    const result = resolveDemoLogin(values);
    if (result.kind === "unknown" || result.kind === "invalid") { setView("unknown"); return; }
    setProvider(result.provider);
    if (scenario === "denied") { setView("denied"); return; }
    if (scenario === "cancelled" || scenario === "configuration") {
      setError(scenario === "cancelled" ? "회사 계정 로그인이 취소되었습니다." : "회사 로그인 연결을 확인할 수 없습니다. 조직 관리자에게 문의해 주세요.");
      setView("error"); return;
    }
    setView("redirect");
  };
  const retry = () => { setView("form"); setError(""); };
  const finishDemoLogin = () => {
    const session = resolveDemoAdmin(getValues("email").trim().toLowerCase());
    if (!session) { setView("denied"); return; }
    update((previous) => ({ ...previous, session }));
    router.replace(state.onboardingCompleted ? "/overview" : "/onboarding");
  };
  return <AuthFrame title={view === "denied" ? "접근 권한이 없습니다" : "회사 계정으로 로그인"}>
    {(view === "form" || view === "unknown") && <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">회사 이메일
        <Input {...register("email", { onChange: () => { setView("form"); setError(""); } })} type="email" autoComplete="email" placeholder="you@company.com" className="h-10" disabled={isSubmitting} aria-invalid={!!errors.email || view === "unknown"} aria-describedby="login-message" />
      </label>
      <div id="login-message" aria-live="polite" className="text-xs text-red">
        {errors.email?.message || error || (view === "unknown" ? "등록된 조직을 찾지 못했습니다. 이메일을 확인하거나 조직 관리자에게 초대를 요청해 주세요." : "")}
      </div>
      <Button type="submit" variant="primary" className="h-10" disabled={isSubmitting}>{isSubmitting ? "로그인 방법 확인 중…" : "회사 계정으로 계속"}</Button>
    </form>}
    {view === "redirect" && <>
      <div role="status" className="rounded-lg bg-sub p-4 text-sm"><p className="font-semibold">{provider}로 이동 중</p><p className="mt-2 break-all text-text2">{getValues("email")}</p></div>
      <p className="text-xs leading-5 text-text3">데모에서는 외부 인증 화면을 열지 않습니다.</p>
      <Button variant="primary" onClick={finishDemoLogin}>데모 인증 완료</Button>
      <Button onClick={retry}>다른 이메일로 로그인</Button>
    </>}
    {(view === "denied" || view === "error") && <>
      <p role="alert" className="text-sm leading-6">{view === "denied" ? "로그인은 완료했지만 이 조직에 접근할 권한이 없습니다. 관리자에게 초대와 역할을 확인해 주세요." : error}</p>
      <Button onClick={retry}>다시 시도</Button>
      <ButtonLink href={ownerMailto}>조직 관리자에게 문의</ButtonLink>
    </>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-text2"><span>아직 도입 전인가요?</span><ButtonLink href="/contact">도입 문의</ButtonLink></div>
    <details className="text-xs text-text3"><summary className="cursor-pointer">데모 시나리오</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p>관리자: admin@codeworks.io<br />새로고침하면 로그인과 온보딩을 처음부터 체험할 수 있습니다.</p>
        <label className="flex flex-col gap-1">회사 로그인 결과<Select value={scenario} disabled={isSubmitting} onChange={(event) => { setScenario(event.target.value as DemoLoginResult); retry(); }}>
          <option value="success">정상</option><option value="cancelled">사용자 취소</option><option value="configuration">연결 오류</option><option value="denied">권한 부족</option><option value="network">조회 실패</option>
        </Select></label>
      </div>
    </details>
  </AuthFrame>;
}
