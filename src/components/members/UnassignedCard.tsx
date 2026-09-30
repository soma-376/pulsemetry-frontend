"use client";

import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import type { ServerTeam } from "@/lib/api/management";
import type { MembersModel } from "@/lib/members-view";

/**
 * 팀 미배정 사용자.
 *
 * 팀이 없는 계정의 비용은 어느 팀에도 귀속되지 않아 개요의 "미배분"으로 빠집니다.
 * 비용이 큰 계정부터 배정해야 팀별 수치가 빨리 정확해집니다 —
 * 그래서 목록 비용의 4분의 1 이상을 쥔 계정은 금액을 빨간색으로 표시합니다.
 */
export function UnassignedCard({
  model,
  picks,
  onPick,
  onApply,
  teams,
  disabled = false,
}: {
  model: MembersModel;
  picks: Record<string, string>;
  onPick: (memberId: string, teamId: string) => void;
  onApply: () => void;
  teams: ServerTeam[];
  /** 저장할 수 없을 때 선택과 배정을 잠근다 */
  disabled?: boolean;
}) {
  const count = model.unassignedRows.filter((u) => picks[u.memberId]).length;

  return (
    <Widget
      label="팀 미배정 사용자"
      title="팀 미배정 사용자"
      note={model.unassignedNote}
      className="col-span-2 @max-[1180px]:col-span-full"
      action={
        <Button
          size="sm"
          variant={count ? "primary" : "default"}
          disabled={disabled || count === 0}
          onClick={onApply}
        >
          {count ? `${count}명 배정` : "팀 배정"}
        </Button>
      }
    >
      <div className="flex flex-col border-t border-border">
        {model.unassignedRows.length === 0 && (
          <p className="py-4 text-[12px] text-text3">모두 배정되었습니다</p>
        )}

        {model.unassignedRows.map((u) => (
          <div
            key={u.memberId}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border px-0.5 py-2.5"
          >
            <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
              <span className="overflow-hidden text-[12.5px] font-semibold text-ellipsis whitespace-nowrap">
                {u.account}
              </span>
              <span className="tnum text-[11px] text-text3">{u.meta}</span>
            </div>
            <span
              className="tnum min-w-16 shrink-0 text-right text-[12px]"
              style={{ color: u.costColor }}
            >
              {u.costText}
            </span>
            <Select
              value={picks[u.memberId] ?? ""}
              onChange={(e) => onPick(u.memberId, e.target.value)}
              aria-label={`${u.account} 팀 선택`}
              className="h-7 shrink-0"
              disabled={disabled}
            >
              <option value="">팀 선택</option>
              {teams.map((t) => (
                <option key={t.teamId} value={t.teamId}>
                  {t.teamName}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    </Widget>
  );
}
