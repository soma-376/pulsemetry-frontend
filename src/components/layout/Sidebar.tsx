"use client";

import { useDashboardHref } from "@/lib/filters";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useOrganization } from "@/lib/organization-store";
import {
  backendLogout,
  sessionRole,
  useBackendSession,
} from "@/lib/api/session";
import { useRateLimit } from "@/lib/use-rate-limit";
import { Icon, type IconName } from "@/components/ui/Icon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/overview", label: "개요", icon: "overview" },
  { href: "/teams", label: "팀 분석", icon: "teams" },
  { href: "/ops", label: "운영 · 보안", icon: "ops" },
  { href: "/members", label: "구성원", icon: "members" },
  { href: "/settings", label: "설정", icon: "settings" },
];

const ROLE_LABEL = {
  owner: "소유자",
  admin: "관리자",
  member: "구성원",
} as const;

const COMPACT_NAV_QUERY = "(max-width: 767px)";
const subscribeViewport = (onChange: () => void) => {
  const viewport = window.matchMedia(COMPACT_NAV_QUERY);
  viewport.addEventListener("change", onChange);
  return () => viewport.removeEventListener("change", onChange);
};
const isCompactViewport = () => window.matchMedia(COMPACT_NAV_QUERY).matches;
const desktopViewport = () => false;

export function Sidebar() {
  const dashboardHref = useDashboardHref();
  const { update } = useOrganization();
  const pathname = usePathname();
  const session = useBackendSession();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutLimit = useRateLimit();
  const compactViewport = useSyncExternalStore(
    subscribeViewport,
    isCompactViewport,
    desktopViewport,
  );
  // 작은 창에서는 기존 아이콘 내비게이션으로 시작한다. 사용자가 직접 고른 열림 상태는 유지한다.
  const [collapseChoice, setCollapseChoice] = useState<boolean | null>(null);
  const collapsed = collapseChoice ?? compactViewport;

  const logout = (
    <button
      type="button"
      disabled={loggingOut || logoutLimit.waiting}
      aria-disabled={logoutLimit.waiting || undefined}
      aria-label={
        logoutLimit.waiting
          ? `로그아웃 · ${logoutLimit.seconds}초 뒤`
          : "로그아웃"
      }
      title="로그아웃"
      onClick={async () => {
        if (loggingOut || logoutLimit.waiting) return;
        setLoggingOut(true);
        setLogoutError("");
        try {
          await backendLogout();
          update((previous) => ({ ...previous, session: null }));
          router.replace("/login");
        } catch (cause) {
          setLogoutError(
            logoutLimit.capture(cause)
              ? ""
              : cause instanceof Error
                ? cause.message
                : "로그아웃에 실패했습니다.",
          );
        } finally {
          setLoggingOut(false);
        }
      }}
      className="shrink-0 cursor-pointer whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] text-text3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {collapsed ? (
        <span aria-hidden="true">↪</span>
      ) : loggingOut ? (
        "로그아웃 중…"
      ) : logoutLimit.waiting ? (
        `로그아웃 · ${logoutLimit.seconds}초 뒤`
      ) : (
        "로그아웃"
      )}
    </button>
  );

  return (
    <nav
      aria-label="주 내비게이션"
      className="sticky top-0 flex h-dvh shrink-0 flex-col self-start overflow-y-auto border-r border-border bg-card px-2 py-3 transition-[width,margin-right] duration-200"
      style={{
        width: collapsed ? 56 : 240,
        // 좁은 화면에서는 펼쳐도 본문이 차지하는 폭을 줄이지 않습니다.
        marginRight: compactViewport && !collapsed ? -184 : 0,
        zIndex: compactViewport ? 50 : undefined,
      }}
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
          onClick={() => setCollapseChoice(!collapsed)}
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
              href={dashboardHref(n.href)}
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
        {/* 계정 표시는 세션을 따른다. 대시보드의 인증 확인과 접근 제어는 RouteGuard가 담당한다. */}
        {session && (
          <>
            {!collapsed && (
              <div
                className="flex flex-col gap-0.5 px-2"
                aria-label="로그인한 계정"
              >
                <div className="text-[13px] font-semibold">
                  {session.user.organizationName}
                </div>
                <div className="overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-text3">
                  {session.user.email}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded border border-border bg-sub px-1.5 py-px text-[11px] font-medium text-text2">
                    {ROLE_LABEL[sessionRole(session)]}
                  </span>
                  {logout}
                </div>
              </div>
            )}
            {collapsed && <div className="flex justify-center">{logout}</div>}
            {(logoutLimit.message || logoutError) && (
              <p role="alert" className="text-xs text-red">
                {logoutLimit.message || logoutError}
              </p>
            )}
          </>
        )}
        {!session && (
          <Link
            href="/login"
            className="rounded-md px-2 py-1 text-xs text-text2 hover:bg-hover"
          >
            로그인
          </Link>
        )}
      </div>
    </nav>
  );
}
