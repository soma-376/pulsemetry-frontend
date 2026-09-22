"use client";

import { useMemo, useState } from "react";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { ModelScatterCard } from "@/components/teams/ModelScatterCard";
import { TeamAxisPanel } from "@/components/teams/TeamAxisPanel";
import { TeamDetailDrawer } from "@/components/teams/TeamDetailDrawer";
import { TeamModelMixCard } from "@/components/teams/TeamModelMixCard";
import { UserUsageCard } from "@/components/teams/UserUsageCard";
import { ButtonLink } from "@/components/ui/Button";
import { useFilters } from "@/lib/filters";
import { buildTeams, type AxisKey } from "@/lib/metrics/teams";
import { useOrganization } from "@/lib/organization-store";
import { TeamManagement } from "@/components/teams/TeamManagement";

/**
 * P2 팀 분석.
 * 전역 필터를 구독하므로 클라이언트 컴포넌트입니다.
 * 축 선택과 선 표시 여부만 로컬 상태이고, 계산은 전부 buildTeams 안에 있습니다.
 */
export function TeamsContent() {
  const { compare, dates } = useFilters();
  const { state } = useOrganization();
  const model = useMemo(() => buildTeams(compare, dates, state.teams), [compare, dates, state.teams]);

  const [axis, setAxis] = useState<AxisKey>("cost");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const detail = model.details.find((team) => team.team === selected);

  const toggleTeam = (team: string) =>
    setHidden((prev) => ({ ...prev, [team]: !prev[team] }));

  return (
    <>
      <FilterToolbar />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 pt-5 pb-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="order-last"><TeamManagement /></div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-[18px] font-semibold tracking-[-0.01em]">
              팀 분석
            </h1>
            <span role="status" className="text-[12px] text-text3">
              {model.headerNote}
            </span>
          </div>
        </div>

        {model.isEmpty ? (
          <div
            role="status"
            className="flex max-w-[620px] flex-col gap-3.5 rounded-[10px] border border-border bg-card p-[22px]"
          >
            <div className="flex flex-col gap-[5px]">
              <span className="text-[15px] font-semibold">
                팀별로 비교할 데이터가 없습니다
              </span>
              <span className="pretty text-[12.5px] text-text2">
                데몬 신호가 아직 들어오지 않아 팀 귀속·사용량을 계산할 수
                없습니다 · 값을 0으로 표시하지 않습니다
              </span>
            </div>
            <ButtonLink href="/overview" variant="primary" className="h-8 self-start px-[13px]">
              개요에서 설치 시작
            </ButtonLink>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <TeamAxisPanel
              model={model}
              axis={axis}
              onAxisChange={setAxis}
              hidden={hidden}
              onToggleTeam={toggleTeam}
              onOpenTeam={(team) => { setSelected(team); setDetailOpen(true); }}
            />

            <div className="grid grid-cols-5 gap-4 @max-[1100px]:grid-cols-1">
              <ModelScatterCard model={model} />
              <TeamModelMixCard model={model} axis={axis} />
            </div>

            <UserUsageCard model={model} />
          </div>
        )}
      </div>
      <TeamDetailDrawer
        team={detail}
        open={detailOpen && !!detail && !model.isEmpty}
        onClose={() => setDetailOpen(false)}
        periodLabel={model.periodLabel}
        compareLabel={model.compareLabel}
        showDelta={model.showDelta}
      />
    </>
  );
}
