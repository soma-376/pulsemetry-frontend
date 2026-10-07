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
    <p className="w-full max-w-[440px] text-xs leading-5 text-text3">데모 환경 · 실제 인증이나 메일 발송은 수행하지 않습니다.</p>
  </>;
}
