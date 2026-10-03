import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return <>
    <header className="flex w-full max-w-[440px] items-center justify-between">
      <Link href="/login" className="text-[15px] font-semibold text-text">Pulsemetry</Link>
      <ThemeToggle />
    </header>
    <main className="flex w-full max-w-[440px] flex-col gap-5 rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      {children}
    </main>
    <p className="w-full max-w-[440px] text-xs leading-5 text-text3">회사 계정 인증은 조직의 로그인 제공자가 처리합니다.</p>
  </>;
}
