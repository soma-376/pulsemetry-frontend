"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AuthFrame } from "./AuthFrame";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { submitInquiry } from "@/lib/api/inquiries";
import { formatKst } from "@/lib/members-view";
import { inquirySchema } from "@/lib/schemas/auth";

type Inquiry = { company: string; email: string };

/**
 * 도입 문의.
 *
 * 입력 확인과 접수는 다른 단계다. 확인 단계에서는 아무것도 보내지 않고,
 * 서버가 접수를 확정한 뒤에만 접수 번호와 시각을 보여 준다.
 */
export function InquiryCard() {
  const [confirming, setConfirming] = useState<Inquiry | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(inquirySchema), defaultValues: { company: "", email: "" } });
  const inquiry = useMutation({ retry: false, mutationFn: (values: Inquiry) => submitInquiry(values) });
  const receipt = inquiry.data;
  const edit = () => { inquiry.reset(); setConfirming(null); };
  const submit = () => { if (confirming && !inquiry.isPending) inquiry.mutate(confirming); };

  return <AuthFrame title="도입 문의">
    <p className="text-sm leading-6 text-text2">개발 조직의 도입 담당자를 확인한 뒤 첫 관리자에게 초대 링크를 보내드립니다.</p>
    {!confirming && <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((values) => setConfirming(values))}>
      <label className="flex flex-col gap-2 text-sm">회사명<Input {...register("company")} autoComplete="organization" className="h-10" aria-invalid={!!errors.company} aria-describedby="inquiry-company-error" /></label>
      <span id="inquiry-company-error" className="text-xs text-red">{errors.company?.message}</span>
      <label className="flex flex-col gap-2 text-sm">회사 이메일<Input {...register("email")} type="email" autoComplete="email" className="h-10" aria-invalid={!!errors.email} aria-describedby="inquiry-email-error" /></label>
      <span id="inquiry-email-error" className="text-xs text-red">{errors.email?.message}</span>
      <Button type="submit" variant="primary" className="h-10">문의 내용 확인</Button>
    </form>}
    {confirming && <section aria-label={receipt ? "접수 결과" : "문의 내용 확인"} className="flex flex-col gap-4">
      {receipt
        ? <p role="status" className="rounded-lg bg-sub p-3 text-sm leading-6">문의를 접수했습니다. 담당자가 접수 내용을 확인한 뒤 입력하신 이메일로 연락드립니다.</p>
        : <p className="text-sm leading-6">아래 내용으로 문의를 접수합니다. 아직 접수되지 않았습니다.</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border p-3 text-sm">
        {receipt && <>
          <dt className="text-text3">접수 번호</dt><dd className="font-mono text-[12.5px] break-all">{receipt.inquiryId}</dd>
          <dt className="text-text3">접수 시각</dt><dd className="tnum">{formatKst(receipt.receivedAt)}</dd>
        </>}
        <dt className="text-text3">회사명</dt><dd className="break-words">{confirming.company}</dd>
        <dt className="text-text3">회사 이메일</dt><dd className="break-all">{confirming.email}</dd>
      </dl>
      {inquiry.error && <ErrorState message={inquiry.error.message} />}
      {receipt
        ? <Button className="h-10" onClick={() => { reset(); edit(); }}>새 문의 작성</Button>
        : <div className="flex gap-2">
          <Button className="h-10 flex-1" disabled={inquiry.isPending} onClick={edit}>수정</Button>
          <Button variant="primary" className="h-10 flex-1" loading={inquiry.isPending} loadingLabel="접수 중…" onClick={submit}>문의 접수</Button>
        </div>}
    </section>}
    <ButtonLink href="/login">로그인으로 돌아가기</ButtonLink>
  </AuthFrame>;
}
