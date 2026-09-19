"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { MembersModel } from "@/lib/metrics/members";

const COLS =
  "grid grid-cols-[minmax(0,1.5fr)_minmax(58px,0.85fr)_minmax(58px,0.95fr)_minmax(62px,0.85fr)_minmax(56px,0.75fr)_minmax(52px,0.65fr)] items-center gap-3";

/**
 * 구성원 목록.
 *
 * 개인별 비용을 보여주지만 순위를 매기지 않습니다 — 좌석 정합과 오남용 확인이
 * 목적이지 평가가 아닙니다. 그래서 등수 열도, 하이라이트도 두지 않습니다.
 */
/** 검색 없이 펼칠 기본 인원 — 전원을 쏟아내면 아무도 끝까지 읽지 않습니다 */
const PAGE = 20;

export function MemberListCard({ model }: { model: MembersModel }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const keyword = query.trim().toLowerCase();

  const matched = model.memberRows.filter(
    (m) =>
      !keyword ||
      m.account.toLowerCase().includes(keyword) ||
      m.team.toLowerCase().includes(keyword),
  );
  // 검색 중에는 결과를 전부 보여줍니다 — 찾는 사람이 잘려 있으면 검색이 무의미합니다
  const rows = keyword ? matched : matched.slice(0, limit);
  const hasMore = !keyword && matched.length > rows.length;

  return (
    <Widget
      label="구성원 목록"
      title="구성원"
      note={model.memberNote(rows.length, keyword)}
      className="col-span-full"
      action={
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이메일 · 팀 검색"
          aria-label="구성원 검색"
          className="w-[220px]"
        />
      }
    >
      <div className={`${COLS} border-b border-border px-0.5 pb-2 text-[11px] text-text3`}>
        <span>사용자</span>
        <span>팀</span>
        <span>역할</span>
        <span className="text-right">이번 주 비용</span>
        <span className="text-right">최근 활동</span>
        <span>상태</span>
      </div>

      {rows.map((m) => (
        <div
          key={m.account}
          className={`${COLS} border-b border-border px-0.5 py-2.5`}
          style={{ opacity: m.opacity }}
        >
          <span className="overflow-hidden text-[12.5px] text-ellipsis whitespace-nowrap">
            {m.account}
          </span>
          <span className="text-[12px]" style={{ color: m.teamColor }}>
            {m.team}
          </span>
          <span className="text-[12px] text-text2">{m.roleLabel}</span>
          <span className="tnum text-right text-[12px]">{m.costText}</span>
          <span className="tnum text-right text-[12px] text-text3">{m.lastSeen}</span>
          <span className="text-[11.5px]" style={{ color: m.stateColor }}>
            {m.stateLabel}
          </span>
        </div>
      ))}

      {rows.length === 0 && (
        <p className="py-6 text-center text-[12px] text-text3">
          검색 결과가 없습니다
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
        {hasMore && (
          <Button onClick={() => setLimit((v) => v + PAGE)}>
            다음 {Math.min(PAGE, matched.length - rows.length)}명 더보기
          </Button>
        )}
        <span className="pretty min-w-0 flex-1 basis-70 text-[11px] text-text3">
          개인별 비용은 좌석 정합·오남용 확인 목적으로만 표시되며 순위를 매기지
          않습니다 · 전체 명단은 내보내기로 확인하세요
        </span>
        <Button>전체 명단 CSV</Button>
      </div>
    </Widget>
  );
}
