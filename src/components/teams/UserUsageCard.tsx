"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import type { TeamsModel } from "@/lib/metrics/teams";

/**
 * 사용자별 사용량.
 *
 * 팀 값을 개인 단위로 펼칩니다. "평균 대비" 열이 이 표의 핵심 —
 * 팀 비용이 올랐을 때 전원이 조금씩 늘었는지, 몇 명이 크게 늘었는지가 갈립니다.
 * 캐시 적중과 마지막 사용은 각각 낭비와 유휴 좌석의 단서입니다.
 *
 * 합계가 팀 값과 정확히 맞도록 계산되어 있어 하단 문구로 그 일치를 보여줍니다.
 */
const COLS =
  "grid grid-cols-[minmax(0,1.7fr)_64px_88px_100px_78px_minmax(0,1.1fr)_76px_88px] items-center gap-x-[18px] gap-y-2 " +
  // 좁아지면 파생 열부터 접습니다 — 계정·환산 금액·평균 대비는 끝까지 남깁니다
  "@max-[900px]:grid-cols-[minmax(0,1.5fr)_88px_96px_76px_76px] @max-[900px]:gap-x-[14px] " +
  "@max-[900px]:[&>*:nth-child(2)]:hidden @max-[900px]:[&>*:nth-child(6)]:hidden @max-[900px]:[&>*:nth-child(8)]:hidden " +
  "@max-[620px]:grid-cols-[minmax(0,1.3fr)_96px_76px] " +
  "@max-[620px]:[&>*:nth-child(3)]:hidden @max-[620px]:[&>*:nth-child(7)]:hidden";

export function UserUsageCard({ model }: { model: TeamsModel }) {
  const [team, setTeam] = useState(model.teams[0]?.team ?? "");
  const [limit, setLimit] = useState(model.userPageSize);

  const data = useMemo(() => model.users(team), [model, team]);
  const rows = data.rows.slice(0, limit);
  const hasMore = data.rows.length > limit;

  const pick = (next: string) => {
    setTeam(next);
    setLimit(model.userPageSize);
  };

  return (
    <section
      id="users"
      aria-label="사용자별 사용량"
      className="flex min-w-0 flex-col rounded-[10px] border border-border bg-card p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">사용자별 사용량</span>
        <span className="pretty text-[11px] text-text3">{data.note}</span>
      </div>

      <div role="group" aria-label="팀 선택" className="mb-3.5 flex flex-wrap gap-1.5">
        {model.teams.map((t) => {
          const active = t.team === data.team;
          return (
            <button
              key={t.team}
              type="button"
              onClick={() => pick(t.team)}
              aria-pressed={active}
              className="h-7 cursor-pointer rounded-full border px-[11px] text-[12px] font-medium whitespace-nowrap"
              style={{
                borderColor: active ? "var(--text)" : "var(--border)",
                background: active ? "var(--text)" : "transparent",
                color: active ? "var(--card)" : "var(--text2)",
              }}
            >
              {t.team}
            </button>
          );
        })}
      </div>

      <div className="mb-[18px] grid grid-cols-5 gap-2 @max-[1100px]:grid-cols-3 @max-[620px]:grid-cols-2">
        {data.stats.map((s) => (
          <StatCard key={s.key} label={s.key} value={s.value} unit={s.sub} tone={s.tone} size="sm" />
        ))}
      </div>

      <div className={`${COLS} border-b border-border px-0.5 pb-2 text-[11px] text-text3`}>
        <span>계정</span>
        <span className="text-right">세션</span>
        <span className="text-right">총 토큰</span>
        <span className="text-right">환산 금액</span>
        <span className="text-right">평균 대비</span>
        <span>주 사용 모델</span>
        <span className="text-right">캐시 적중</span>
        <span className="text-right">마지막 사용</span>
      </div>

      {rows.map((u) => (
        <div key={u.key} className={`${COLS} border-b border-border px-0.5 py-2.5`}>
          <span className="overflow-hidden font-mono text-[12px] text-ellipsis whitespace-nowrap text-text2">
            {u.account}
          </span>
          <span className="tnum text-right text-[12px] text-text2">{u.sessions}</span>
          <span className="tnum text-right text-[12px] text-text2">{u.tokens}</span>
          <span className="tnum text-right text-[12px] font-semibold">{u.cost}</span>
          <span
            className="tnum text-right text-[12px] font-semibold"
            style={{ color: u.deviationColor }}
          >
            {u.deviationText}
          </span>
          <span className="overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-text2">
            {u.model}
          </span>
          <span className="tnum text-right text-[12px]" style={{ color: u.cacheColor }}>
            {u.cache}
          </span>
          <span className="tnum text-right text-[12px]" style={{ color: u.lastColor }}>
            {u.last}
          </span>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 pt-3">
        {hasMore && (
          <Button onClick={() => setLimit((v) => v + model.userPageSize)}>
            다음 {Math.min(model.userPageSize, data.rows.length - limit)}명 더보기
          </Button>
        )}
        <div className="flex-1" />
        <span className="tnum text-[11.5px] whitespace-nowrap text-text2">
          {data.sumNote(rows.length)}
        </span>
      </div>
    </section>
  );
}
