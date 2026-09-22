"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthFrame } from "./AuthFrame";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { inquirySchema } from "@/lib/schemas/auth";

export function InquiryCard() {
  const [prepared, setPrepared] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(inquirySchema), defaultValues: { company: "", email: "" } });
  return <AuthFrame title="도입 문의">
    <p className="text-sm leading-6 text-text2">개발 조직의 도입 담당자를 확인한 뒤 첫 관리자에게 초대 링크를 보내드립니다.</p>
    <form noValidate className="flex flex-col gap-4" onChange={() => setPrepared(false)} onSubmit={handleSubmit(() => setPrepared(true))}>
      <label className="flex flex-col gap-2 text-sm">회사명<Input {...register("company")} autoComplete="organization" className="h-10" aria-invalid={!!errors.company} aria-describedby="inquiry-company-error" /></label>
      <span id="inquiry-company-error" className="text-xs text-red">{errors.company?.message}</span>
      <label className="flex flex-col gap-2 text-sm">회사 이메일<Input {...register("email")} type="email" autoComplete="email" className="h-10" aria-invalid={!!errors.email} aria-describedby="inquiry-email-error" /></label>
      <span id="inquiry-email-error" className="text-xs text-red">{errors.email?.message}</span>
      <Button type="submit" variant="primary" className="h-10" disabled={isSubmitting}>문의 내용 확인</Button>
    </form>
    {prepared && <div role="status" className="rounded-lg bg-sub p-3 text-sm leading-6">입력 내용을 확인했습니다. 데모에서는 문의가 접수되지 않습니다. 실제 서비스에서는 접수 후 담당자 확인을 거쳐 관리자 초대를 보내드립니다.</div>}
    <ButtonLink href="/login">로그인으로 돌아가기</ButtonLink>
  </AuthFrame>;
}
