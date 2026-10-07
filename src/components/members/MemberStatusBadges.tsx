import type { memberSeatStatus } from "@/lib/metrics/member-seats";

const tones = {
  active: "bg-green/10 text-green",
  candidate: "bg-orange-ink/10 text-orange-ink",
  neutral: "bg-sub text-text3",
};

export const MEMBER_STATUS_LABELS = {
  active: "활성",
  candidate: "회수 후보",
  unobserved: "신호 대기",
  unknown: "확인 필요",
} as const;

export function memberDisplayStatus(status: ReturnType<typeof memberSeatStatus>): keyof typeof MEMBER_STATUS_LABELS {
  return status.candidate ? "candidate" : status.active ? "active" : status.unobserved ? "unobserved" : "unknown";
}

export function MemberStatusBadge({ label, tone }: { label: string; tone: keyof typeof tones }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10.5px] whitespace-nowrap ${tones[tone]}`}>{label}</span>;
}

export function MemberStatusBadges({ status, className = "" }: { status: ReturnType<typeof memberSeatStatus>; className?: string }) {
  const label = MEMBER_STATUS_LABELS[memberDisplayStatus(status)];
  const tone = status.candidate ? "candidate" : status.active ? "active" : "neutral";
  return <span className={`flex items-center ${className}`}><MemberStatusBadge label={label} tone={tone} /></span>;
}
