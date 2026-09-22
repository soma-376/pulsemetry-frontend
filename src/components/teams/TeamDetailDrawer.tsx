"use client";

import { ProgressBar } from "@/components/charts/ProgressBar";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import type { TeamsModel } from "@/lib/metrics/teams";

export function TeamDetailDrawer({ team, open, onClose, periodLabel, compareLabel, showDelta }: {
  team: TeamsModel["details"][number] | undefined;
  open: boolean;
  onClose: () => void;
  periodLabel: string;
  compareLabel: string;
  showDelta: boolean;
}) {
  return (
      <DetailDrawer open={open} onClose={onClose} title={team ? team.unmapped ? "미배정" : `${team.team} 팀` : "팀 상세"} subtitle={periodLabel}>
        {team && (
          <div className="flex flex-col gap-6">
            {team.unmapped && <p className="rounded-lg bg-sub p-3 text-xs text-text2">팀에 배정되지 않은 사용량입니다.</p>}
            <div className="grid grid-cols-2 gap-3">
              {[["환산가치", team.costText], ["활성 사용자", `${team.users}명`], ["사용자당", team.perUserText], ["세션", team.sessions], ["토큰", team.tokens], ["증가 기여", team.contribText]].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border p-3"><p className="text-[11px] text-text3">{label}</p><p className="tnum mt-1 text-xl font-semibold">{value}</p></div>
              ))}
            </div>
            <section><h3 className="mb-3 text-[13px] font-semibold">모델별 환산가치 비중</h3>
              <div className="flex flex-col gap-4">{team.models.map((item) => <div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span>{item.name}</span><span className="tnum font-medium">{item.share.toFixed(1)}%</span></div><ProgressBar width={`${item.share}%`} color={item.color} height={7} /></div>)}</div>
            </section>
            <p className="rounded-lg bg-sub p-3 text-[11px] leading-relaxed text-text2">{showDelta ? `${compareLabel} 사용자당 환산가치 ${team.perUserDelta}. 증가 기여는 조직 전체의 환산가치 변화 중 이 팀의 변화액입니다.` : "비교 기간을 선택하고 충분한 데이터가 있을 때 증감률을 표시합니다."}</p>
          </div>
        )}
      </DetailDrawer>
  );
}
