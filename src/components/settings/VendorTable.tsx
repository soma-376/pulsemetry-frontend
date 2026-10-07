"use client";

import { Button } from "@/components/ui/Button";
import type { VendorRow } from "@/lib/settings";

const COLS =
  "grid grid-cols-[minmax(0,1fr)_104px_128px_104px_24px] items-center gap-3 " +
  // 좁아지면 상태·좌석부터 접습니다 — 이름과 금액은 끝까지 남깁니다
  "@max-[860px]:grid-cols-[minmax(0,1fr)_104px_24px] @max-[860px]:[&>*:nth-child(2)]:hidden @max-[860px]:[&>*:nth-child(3)]:hidden";

/**
 * 연동 벤더 목록.
 *
 * 행을 누르면 계약 설정 드로어가 열립니다. 목록에서 바로 고치지 않는 이유는
 * 계약 입력이 조직 전체 지출을 바꾸기 때문입니다 — 초안에 쓰고 저장할 때만 반영합니다.
 */
export function VendorTable({
  rows,
  onOpen,
  onAdd,
}: {
  rows: VendorRow[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-sub px-3.5 py-2.5">
        <span className="text-[12px] font-semibold whitespace-nowrap">
          연동 벤더 {rows.length}
        </span>
        <div className="flex-1" />
        <Button onClick={onAdd}>벤더 추가</Button>
      </div>

      {rows.map((v, i) => (
        <div
          key={v.id}
          role="button"
          tabIndex={0}
          aria-label={v.openLabel}
          onClick={() => onOpen(v.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(v.id);
            }
          }}
          className={`${COLS} cursor-pointer px-3.5 py-3 hover:bg-hover ${i === 0 ? "" : "border-t border-border"}`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {/* 점 하나가 설정 여부를 요약합니다 — 회색 미설정, 주황 확인 필요, 초록 설정됨 */}
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: v.dot }}
            />
            <div className="flex min-w-0 flex-col">
              <span className="overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap">
                {v.short}
              </span>
              <span className="overflow-hidden text-[11.5px] text-ellipsis whitespace-nowrap text-text2">
                {v.product}
              </span>
            </div>
          </div>

          <span
            className="text-[11.5px] font-semibold whitespace-nowrap"
            style={{ color: v.statusFg }}
          >
            {v.statusLabel}
          </span>
          <span className="tnum text-[12px] whitespace-nowrap text-text2">
            {v.seatsText}
          </span>
          <span
            className="tnum text-right text-[13px] font-semibold whitespace-nowrap"
            style={{ color: v.spendFg }}
          >
            {v.spendText}
          </span>
          <span className="flex items-center justify-center text-text3">›</span>
        </div>
      ))}
    </div>
  );
}
