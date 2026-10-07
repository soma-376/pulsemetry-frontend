"use client";

import { ProgressBar } from "@/components/charts/ProgressBar";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import type { TeamDetail } from "@/lib/metrics/teams-presentation";

function ShareList({
  items,
}: {
  items: {
    key: string;
    name: string;
    share: number | null;
    color: string;
    sub?: string;
  }[];
}) {
  if (items.length === 0)
    return <p className="text-xs text-text3">관측 없음</p>;
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <div key={item.key}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span>
              {item.name}
              {item.sub && (
                <span className="ml-1.5 text-text3">{item.sub}</span>
              )}
            </span>
            <span className="tnum font-medium">
              {item.share === null ? "-" : `${item.share.toFixed(1)}%`}
            </span>
          </div>
          <ProgressBar
            width={`${item.share ?? 0}%`}
            color={item.color}
            height={7}
          />
        </div>
      ))}
    </div>
  );
}

export function TeamDetailDrawer({
  team,
  open,
  onClose,
  periodLabel,
  compareLabel,
  showDelta,
  comparisonReason,
  loading = false,
  error,
  onRetry,
}: {
  team: TeamDetail | undefined;
  open: boolean;
  onClose: () => void;
  periodLabel: string;
  compareLabel: string;
  showDelta: boolean;
  comparisonReason: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={team ? (team.unmapped ? "미배정" : `${team.team} 팀`) : "팀 상세"}
      subtitle={periodLabel}
    >
      {!team && loading && (
        <LoadingState message="팀 상세를 불러오는 중입니다…" />
      )}
      {!team && error && <ErrorState message={error} onRetry={onRetry} />}
      {team && (
        <div className="flex flex-col gap-6">
          {team.unmapped && (
            <p className="rounded-lg bg-sub p-3 text-xs text-text2">
              팀에 배정되지 않은 사용량입니다.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {[
              ["환산가치", team.costText],
              ["활성 사용자", team.users === "-" ? "-" : `${team.users}명`],
              ["사용자당", team.perUserText],
              ["세션", team.sessions],
              ["토큰", team.tokens],
              ["증가 기여", team.contribText],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-text3">{label}</p>
                <p className="tnum mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <section>
            <h3 className="mb-3 text-[13px] font-semibold">
              제품별 환산가치 비중
            </h3>
            <ShareList
              items={team.products.map((item) => ({
                key: item.key,
                name: item.name,
                share: item.share,
                color: item.color,
                sub: `${item.costText} · ${item.users === "-" ? "-" : `${item.users}명`}`,
              }))}
            />
          </section>
          <section>
            <h3 className="mb-3 text-[13px] font-semibold">
              모델별 환산가치 비중
            </h3>
            <ShareList
              items={team.models.map((item) => ({
                key: item.name,
                name: item.name,
                share: item.share,
                color: item.color,
              }))}
            />
          </section>
          <p className="rounded-lg bg-sub p-3 text-[11px] leading-relaxed text-text2">
            {showDelta
              ? `${compareLabel} 사용자당 환산가치 ${team.perUserDelta}. 증가 기여는 조직 전체의 환산가치 변화 중 이 팀의 변화액입니다.`
              : comparisonReason ||
                "비교 기간을 선택하면 두 기간이 모두 완전하게 수집됐을 때 증감을 표시합니다."}
          </p>
        </div>
      )}
    </DetailDrawer>
  );
}
