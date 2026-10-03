"use client";
import { useEffect } from "react";
import { AuthFrame } from "./AuthFrame";
import { ButtonLink } from "@/components/ui/Button";

/** 이전 초대 링크도 비밀번호 가입으로 연결하지 않는다. 코드는 CLI 설치에만 쓴다. */
export function InviteAcceptCard() {
  useEffect(() => { if (window.location.hash) window.history.replaceState(null, "", window.location.pathname); }, []);
  return <AuthFrame title="회사 계정으로 시작하기">
    <p className="text-sm leading-6">초대받은 회사 이메일로 SSO 로그인하세요. 비밀번호는 회사 인증 페이지에서만 입력합니다.</p>
    <p className="text-sm leading-6 text-text2">초대 코드는 CLI 설치용입니다. 설치하려면 메일에 안내된 설치 명령을 사용하세요.</p>
    <ButtonLink href="/login">회사 계정으로 로그인</ButtonLink>
  </AuthFrame>;
}
