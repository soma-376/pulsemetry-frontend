/**
 * 아이콘 — 원본 DC 스크립트의 `ico()` 헬퍼를 그대로 옮겼습니다.
 * 24 격자에 그린 path/circle 을 currentColor 스트로크로만 그립니다(채움 없음).
 * 아이콘 라이브러리를 쓰지 않는 이유는 원본 path 가 디자인의 일부이기 때문입니다.
 */

/** 문자열이면 <path d>, 배열이면 <circle cx cy r> */
type Part = string | [cx: number, cy: number, r: number];

export type IconName =
  | "overview"
  | "teams"
  | "ops"
  | "members"
  | "settings"
  | "calendar"
  | "sun"
  | "moon";

const PARTS: Record<IconName, Part[]> = {
  overview: ["M4.5 15.5a7.5 7.5 0 0 1 15 0", "M12 15.5l3.6-4.2", [12, 15.5, 1.1]],
  teams: [
    [9, 8.5, 3],
    "M3.8 19c0-2.9 2.3-5.2 5.2-5.2s5.2 2.3 5.2 5.2",
    "M16.2 6.6a2.9 2.9 0 0 1 0 5.6",
    "M17.4 14.4c1.9.7 2.8 2.4 2.8 4.6",
  ],
  ops: [
    "M12 3.6l6.6 2.4v5.4c0 4-2.7 7.1-6.6 9-3.9-1.9-6.6-5-6.6-9V6z",
    "M9.4 12.2l1.9 1.9 3.5-3.9",
  ],
  members: [
    [9.5, 8, 3.1],
    "M3.6 19.2c0-3.3 2.6-5.9 5.9-5.9s5.9 2.6 5.9 5.9",
    "M17.4 9.4h4.4",
    "M19.6 7.2v4.4",
  ],
  settings: [
    "M4.5 8.4h8.2",
    "M17.4 8.4h2.1",
    [15, 8.4, 1.9],
    "M4.5 15.9h3.1",
    "M11.9 15.9h7.6",
    [9.7, 15.9, 1.9],
  ],
  calendar: [
    "M5.5 5.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z",
    "M8 3.5v4",
    "M16 3.5v4",
    "M3.5 11h17",
  ],
  sun: [
    [12, 12, 4.4],
    "M12 2.6v2.4",
    "M12 19v2.4",
    "M2.6 12h2.4",
    "M19 12h2.4",
    "M5.4 5.4l1.7 1.7",
    "M16.9 16.9l1.7 1.7",
    "M18.6 5.4l-1.7 1.7",
    "M7.1 16.9l-1.7 1.7",
  ],
  moon: ["M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a7.4 7.4 0 1 0 10.8 10.8z"],
};

export type IconProps = {
  name: IconName;
  /** px. 12 이하에서는 선을 굵게 보정합니다 (원본 ico12 와 동일) */
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function Icon({ name, size = 16, strokeWidth, className }: IconProps) {
  const width = strokeWidth ?? (size <= 12 ? 2 : 1.7);

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
    >
      {PARTS[name].map((p, i) =>
        typeof p === "string" ? (
          <path
            key={i}
            d={p}
            style={{
              fill: "none",
              stroke: "currentColor",
              strokeWidth: width,
              strokeLinecap: "round",
              strokeLinejoin: "round",
            }}
          />
        ) : (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={p[2]}
            style={{
              fill: "none",
              stroke: "currentColor",
              strokeWidth: width,
            }}
          />
        ),
      )}
    </svg>
  );
}
