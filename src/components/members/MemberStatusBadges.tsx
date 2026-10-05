import { MEMBER_STATUS_LABELS, type MemberActivity } from "@/lib/members-view";

const tones = {
  active: "bg-green/10 text-green",
  candidate: "bg-orange-ink/10 text-orange-ink",
  neutral: "bg-sub text-text3",
};

export function MemberStatusBadge({ label, tone }: { label: string; tone: keyof typeof tones }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10.5px] whitespace-nowrap ${tones[tone]}`}>{label}</span>;
}

/** 사용 관측 상태 하나를 보여 준다. 좌석 배정 상태는 상세에서 따로 표시한다. */
export function MemberStatusBadges({ status, className = "" }: { status: MemberActivity; className?: string }) {
  const tone = status === "candidate" ? "candidate" : status === "active" ? "active" : "neutral";
  return <span className={`flex items-center ${className}`}><MemberStatusBadge label={MEMBER_STATUS_LABELS[status]} tone={tone} /></span>;
}
