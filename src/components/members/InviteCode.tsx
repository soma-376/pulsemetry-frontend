"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** 발급된 초대 코드 한 개. 서버가 다시 주지 않는 값이라 화면에만 두고 저장하지 않는다. */
export function InviteCode({ email, code, label = "초대 코드" }: { email: string; code: string; label?: string }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied("done");
    } catch {
      // 권한이 없으면 직접 선택해 복사하게 한다.
      setCopied("failed");
    }
  };
  return <span className="flex flex-wrap items-center gap-2">
    <code aria-label={`${email} ${label}`} className="rounded border border-border bg-card px-2 py-1 font-mono text-[12.5px] tracking-wider text-text select-all">{code}</code>
    <Button size="sm" onClick={() => void copy()} aria-label={`${email} ${label} 복사`}>{copied === "done" ? "복사됨" : "복사"}</Button>
    {copied === "failed" && <span className="text-red">복사하지 못했습니다. 코드를 직접 선택해 복사하세요.</span>}
  </span>;
}
