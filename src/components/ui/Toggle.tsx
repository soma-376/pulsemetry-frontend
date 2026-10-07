"use client";

export type ToggleProps = {
  on: boolean;
  onChange: () => void;
  label: string;
  /** 켜졌을 때 트랙 색 — 위험한 설정은 red 를 넘깁니다 */
  onColor?: string;
  disabled?: boolean;
};

/**
 * 온·오프 스위치.
 *
 * 테마 토글처럼 아이콘을 담는 스위치와 달리, 이건 설정 행 끝에 붙는 작은 스위치입니다.
 * 켜짐 색을 넘길 수 있게 둔 이유는 "프롬프트 원문 수집"처럼 켜는 것이 위험한 설정이
 * 다른 설정과 같은 파란색으로 보이면 안 되기 때문입니다.
 */
export function Toggle({
  on,
  onChange,
  label,
  onColor = "var(--blue)",
  disabled = false,
}: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      className="shrink-0 cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default disabled:opacity-50"
    >
      <span
        className="relative block h-[17px] w-[30px] rounded-full transition-colors"
        style={{ background: on ? onColor : "var(--gray)" }}
      >
        <span
          className="absolute top-0.5 h-[13px] w-[13px] rounded-full bg-white transition-[left]"
          style={{ left: on ? 15 : 2 }}
        />
      </span>
    </button>
  );
}
