"use client";

import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import type { MembersModel } from "@/lib/metrics/members";

/**
 * 좌석 회수 후보.
 *
 * 오래 안 쓴 계정을 골라 좌석을 회수합니다. 회수는 되돌리기 어려운 동작이라
 * 여기서 바로 처리하지 않고 확인 모달을 거칩니다.
 */
export function SeatReclaimCard({
  model,
  picked,
  onToggle,
  onConfirm,
  undoCount,
  onUndo,
}: {
  model: MembersModel;
  picked: Record<string, boolean>;
  onToggle: (account: string) => void;
  onConfirm: () => void;
  undoCount: number;
  onUndo: () => void;
}) {
  const count = model.reclaimRows.filter((r) => picked[r.account]).length;

  return (
    <Widget
      label="좌석 회수 후보"
      title="좌석 회수 후보"
      note={model.reclaimNote}
      className="col-span-2 @max-[1180px]:col-span-full"
      action={
        <div className="flex shrink-0 items-center gap-2">
          {undoCount > 0 && (
            <Button size="sm" onClick={onUndo}>
              {undoCount}석 회수됨 — 되돌리기
            </Button>
          )}
          <Button
            size="sm"
            variant={count ? "primary" : "default"}
            disabled={count === 0 || model.isEmpty}
            onClick={onConfirm}
          >
            {model.isEmpty ? "측정 대기" : count ? `${count}석 회수` : "좌석 회수"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col border-t border-border">
        {model.reclaimRows.length === 0 && (
          <p className="py-4 text-[12px] text-text3">
            {model.isEmpty
              ? "수집이 시작되면 여기에 후보가 나타납니다"
              : "회수할 좌석이 없습니다"}
          </p>
        )}

        {model.reclaimRows.map((r) => (
          <div
            key={r.account}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border px-0.5 py-2.5"
          >
            <input
              type="checkbox"
              checked={!!picked[r.account]}
              onChange={() => onToggle(r.account)}
              aria-label={`${r.account} 회수 선택`}
              className="h-[14px] w-[14px] shrink-0 cursor-pointer"
              style={{ accentColor: "var(--blue)" }}
            />
            <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
              <span className="overflow-hidden text-[12.5px] font-semibold text-ellipsis whitespace-nowrap">
                {r.account}
              </span>
              <span className="tnum text-[11px] text-text3">{r.meta}</span>
            </div>
            <span className="tnum min-w-16 shrink-0 text-right text-[12px] text-text3">
              {r.idleText}
            </span>
          </div>
        ))}
      </div>
    </Widget>
  );
}
