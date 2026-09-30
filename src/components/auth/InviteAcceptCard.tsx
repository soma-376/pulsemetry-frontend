"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AuthFrame } from "./AuthFrame";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { acceptInvitation } from "@/lib/api/signup";
import { INVITATION_CODE, signupSchema, type SignupForm } from "@/lib/schemas/auth";

/**
 * 초대 수락 — 초대 메일의 링크가 가리키는 화면.
 *
 * 코드는 주소의 fragment(`#code=…`)로 온다. fragment는 서버로 가지 않지만 브라우저 기록에는 남으므로,
 * 읽은 뒤 주소에서 지운다. 코드는 폼 안에만 두고 저장하지 않는다.
 * 계정은 서버가 201을 준 뒤에만 만들어졌다고 말한다.
 */
export function InviteAcceptCard() {
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<SignupForm>({ resolver: zodResolver(signupSchema), defaultValues: { code: "", email: "", password: "", confirm: "" } });
  const signup = useMutation({ retry: false, mutationFn: (values: SignupForm) => acceptInvitation(values) });

  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code")?.trim().toUpperCase();
    if (!window.location.hash) return;
    // 형식이 맞는 코드만 채운다. 어느 쪽이든 주소에서는 지운다.
    if (code && INVITATION_CODE.test(code)) setValue("code", code);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [setValue]);

  if (signup.isSuccess) return <AuthFrame title="초대 수락">
    <p role="status" className="rounded-lg bg-sub p-3 text-sm leading-6">계정을 만들었습니다. 초대에 지정된 팀과 역할이 적용되었습니다.</p>
    <p className="text-sm leading-6 text-text2">CLI를 설치하려면 초대 메일의 설치 명령을 터미널에 붙여넣으세요. 설치는 가입과 따로 한 번 할 수 있습니다.</p>
    <ButtonLink href="/login">로그인으로 이동</ButtonLink>
  </AuthFrame>;

  const field = (name: "code" | "email" | "password" | "confirm") => ({ "aria-invalid": !!errors[name], "aria-describedby": `invite-${name}-error` });
  return <AuthFrame title="초대 수락">
    <p className="text-sm leading-6 text-text2">초대 메일의 코드로 계정을 만듭니다. 초대받은 이메일 주소로만 가입할 수 있습니다.</p>
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((values) => { if (!signup.isPending) signup.mutate(values); })}>
      <fieldset disabled={signup.isPending} className="flex min-w-0 flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">초대 코드<Input {...register("code")} autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX" className="h-10 font-mono tracking-wider uppercase" {...field("code")} /></label>
        <span id="invite-code-error" className="text-xs text-red">{errors.code?.message}</span>
        <label className="flex flex-col gap-2 text-sm">회사 이메일<Input {...register("email")} type="email" autoComplete="username" className="h-10" {...field("email")} /></label>
        <span id="invite-email-error" className="text-xs text-red">{errors.email?.message}</span>
        <label className="flex flex-col gap-2 text-sm">비밀번호<Input {...register("password")} type="password" autoComplete="new-password" className="h-10" {...field("password")} /></label>
        <span id="invite-password-error" className="text-xs text-red">{errors.password?.message ?? <span className="text-text3">12글자 이상</span>}</span>
        <label className="flex flex-col gap-2 text-sm">비밀번호 확인<Input {...register("confirm")} type="password" autoComplete="new-password" className="h-10" {...field("confirm")} /></label>
        <span id="invite-confirm-error" className="text-xs text-red">{errors.confirm?.message}</span>
      </fieldset>
      {signup.error && <ErrorState message={signup.error.message} />}
      <Button type="submit" variant="primary" className="h-10" loading={signup.isPending} loadingLabel="계정 만드는 중…">계정 만들기</Button>
    </form>
    <ButtonLink href="/login">로그인으로 돌아가기</ButtonLink>
  </AuthFrame>;
}
