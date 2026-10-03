"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthFrame } from "./AuthFrame";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { loginSchema, type LoginForm } from "@/lib/schemas/auth";
import { discoverOrganizations, startOidcLogin } from "@/lib/oidc";

export function LoginCard() {
  const [redirecting, setRedirecting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema), defaultValues: { email: "" },
  });
  const start = useMutation({ mutationFn: async ({ organizationId, email }: { organizationId: string; email: string }) => {
    await startOidcLogin(organizationId, email); setRedirecting(true);
  }, retry: false });
  const discovery = useMutation({ mutationFn: async ({ email }: LoginForm) => {
    const organizations = await discoverOrganizations(email);
    if (organizations.length === 1) await start.mutateAsync({ organizationId: organizations[0].organizationId, email });
    return { organizations, email };
  }, retry: false });
  const busy = discovery.isPending || start.isPending || redirecting;
  const choices = discovery.data?.organizations ?? [];
  const error = discovery.error ?? start.error;
  return <AuthFrame title="회사 계정으로 로그인">
    <form onSubmit={handleSubmit(values => discovery.mutate(values))} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">회사 이메일
        <Input {...register("email", { onChange: () => { discovery.reset(); start.reset(); } })} type="email" autoComplete="email"
          placeholder="you@company.com" className="h-10" disabled={busy} aria-invalid={!!errors.email}
          aria-describedby="login-message" />
      </label>
      <div id="login-message" aria-live="polite" className="text-xs text-red">
        {errors.email?.message || (discovery.isSuccess && !choices.length ? "등록된 조직을 찾지 못했습니다. 이메일을 확인하거나 조직 관리자에게 문의해 주세요." : "")}
      </div>
      <Button type="submit" variant="primary" className="h-10" loading={busy}
        loadingLabel={redirecting ? "회사 로그인 화면으로 이동 중…" : "로그인 방법 확인 중…"}>회사 계정으로 계속</Button>
    </form>
    {error && <p role="alert" className="text-sm">{error instanceof Error ? error.message : "로그인을 시작하지 못했습니다."}</p>}
    {choices.length > 1 && <section aria-label="회사 선택" className="flex flex-col gap-2">
      <p className="text-sm">소속된 회사가 여러 곳입니다. 로그인할 회사를 선택해 주세요.</p>
      {choices.map(org => <Button key={org.organizationId} disabled={busy} onClick={() => start.mutate({ organizationId: org.organizationId, email: discovery.data!.email })}>{org.organizationName}</Button>)}
    </section>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-text2">
      <span>아직 도입 전인가요?</span><ButtonLink href="/contact">도입 문의</ButtonLink>
    </div>
  </AuthFrame>;
}
