"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useOrganization } from "@/lib/organization-store";
import { AUTH_SEED } from "@/mocks/auth";
import { Icon, type IconName } from "@/components/ui/Icon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/overview", label: "개요", icon: "overview" },
  { href: "/teams", label: "팀 분석", icon: "teams" },
  { href: "/ops", label: "운영 · 보안", icon: "ops" },
  { href: "/members", label: "구성원", icon: "members" },
  { href: "/settings", label: "설정", icon: "settings" },
];

export function Sidebar() {
  const { state, update } = useOrganization();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      aria-label="주 내비게이션"
      className="sticky top-0 flex h-dvh shrink-0 flex-col self-start overflow-y-auto border-r border-border bg-card px-2 py-3 transition-[width] duration-200"
      style={{ width: collapsed ? 56 : 240 }}
    >
      <div className="flex min-h-9 shrink-0 items-center justify-between px-2 pt-1 pb-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-[5px] bg-blue" />
            <span className="text-[14px] font-semibold tracking-[-0.01em]">
              Pulsemetry
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label="내비게이션 접기/펼치기"
          aria-expanded={!collapsed}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-[12px] text-text3 hover:bg-hover"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <div className="flex shrink-0 flex-col gap-0.5">
        {NAV.map((n) => {
          const current = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              title={n.label}
              aria-current={current ? "page" : undefined}
              className="flex h-[34px] items-center gap-2.5 rounded-md px-2.5 text-[13px] no-underline hover:bg-hover hover:no-underline"
              style={{
                fontWeight: current ? 600 : 500,
                color: current ? "var(--text)" : "var(--text2)",
                background: current ? "var(--sub)" : "transparent",
              }}
            >
              <span className="flex shrink-0 opacity-90">
                <Icon name={n.icon} />
              </span>
              {!collapsed && (
                <span className="flex-1 whitespace-nowrap">{n.label}</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 flex-col gap-2.5 border-t border-border pt-3">
        {!collapsed && (
          <div className="flex flex-col gap-0.5 px-2">
            <div className="text-[13px] font-semibold">{AUTH_SEED.organizationName}</div>
            <div className="overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-text3">
              {state.session?.email}
            </div>
            <div className="mt-1">
              <span className="rounded border border-border bg-sub px-1.5 py-px text-[11px] font-medium text-text2">
                관리자
              </span>
            </div>
          </div>
        )}
        <Link href="/login" onClick={() => update((previous) => ({ ...previous, session: null }))} className="rounded-md px-2 py-1 text-xs text-text3 hover:bg-hover">로그아웃</Link>
      </div>
    </nav>
  );
}
