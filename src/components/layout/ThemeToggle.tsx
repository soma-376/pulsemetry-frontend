"use client";

import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/lib/theme";

/**
 * 테마 스위치.
 * 손잡이가 현재 테마 아이콘을 담고, 반대쪽에는 전환될 테마 아이콘만 흐리게 남습니다.
 */
export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const title = isDark ? "라이트 테마로 전환" : "다크 테마로 전환";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={title}
      title={title}
      onClick={toggleTheme}
      className="relative h-[26px] w-[46px] shrink-0 cursor-pointer rounded-[13px] border border-border bg-sub p-0"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-between px-[5px] text-text3"
      >
        <span
          className="flex"
          style={{ visibility: isDark ? "visible" : "hidden" }}
        >
          <Icon name="sun" size={12} />
        </span>
        <span
          className="flex"
          style={{ visibility: isDark ? "hidden" : "visible" }}
        >
          <Icon name="moon" size={12} />
        </span>
      </span>
      <span
        aria-hidden="true"
        className="absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--text)] text-[var(--card)] transition-[left] duration-200"
        style={{ left: isDark ? 23 : 2 }}
      >
        <Icon name={isDark ? "moon" : "sun"} size={12} />
      </span>
    </button>
  );
}
