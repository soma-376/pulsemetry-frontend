"use client";

import { useEffect, useRef, useState } from "react";
import { MEMBER_STATUS_LABELS, memberDisplayStatus, MemberStatusBadges } from "./MemberStatusBadges";
import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SortHeader } from "@/components/ui/SortHeader";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { nextSort, sortRows, type SortState } from "@/lib/sort";
import type { MembersModel } from "@/lib/metrics/members";

const COLS =
  "grid grid-cols-[minmax(160px,1.5fr)_minmax(72px,0.85fr)_minmax(72px,0.95fr)_minmax(80px,0.85fr)_100px_140px_24px] items-center gap-4";

/**
 * 구성원 목록.
 *
 * 개인별 비용을 보여주지만 순위를 매기지 않습니다 — 좌석 정합과 오남용 확인이
 * 목적이지 평가가 아닙니다. 그래서 등수 열도, 하이라이트도 두지 않습니다.
 */
/** 검색 없이 펼칠 기본 인원 — 전원을 쏟아내면 아무도 끝까지 읽지 않습니다 */
const PAGE = 20;
const SEARCH_DELAY_MS = 250;
type SortKey = "account" | "team" | "cost" | "activity";
type StatusFilter = "all" | keyof typeof MEMBER_STATUS_LABELS;
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  ...Object.entries(MEMBER_STATUS_LABELS).map(([value, label]) => ({ value: value as StatusFilter, label })),
];

export function MemberListCard({ model, onOpen }: { model: MembersModel; onOpen: (member: MembersModel["memberRows"][number]) => void }) {
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "account", direction: "asc" });
  const [searchHeight, setSearchHeight] = useState<number | null>(null);
  const results = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);

  const cancelSearch = () => {
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    searchTimer.current = null;
  };
  const applySearch = (value: string) => {
    cancelSearch();
    const next = value.trim().toLowerCase();
    if (next) {
      // 결과가 줄어들기 전에 높이를 보존합니다. 같은 검색 중 늘어난 높이도 유지합니다.
      const height = Math.ceil(results.current?.getBoundingClientRect().height ?? 0);
      setSearchHeight((previous) => Math.max(previous ?? 0, height));
    } else {
      setSearchHeight(null);
    }
    setKeyword(next);
  };
  const changeQuery = (value: string) => {
    setQuery(value);
    cancelSearch();
    // 한글의 마지막 글자는 조합 상태로 남을 수 있으므로, 조합 종료 대신 입력이 멈춘 시간을 기준으로 검색합니다.
    if (!value.trim()) { applySearch(""); return; }
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      applySearch(value);
    }, SEARCH_DELAY_MS);
  };
  useEffect(() => () => {
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
  }, []);

  const matched = model.memberRows.filter(
    (m) =>
      (status === "all" || memberDisplayStatus(m.seatStatus) === status) &&
      (!keyword ||
      m.account.toLowerCase().includes(keyword) ||
      m.team.toLowerCase().includes(keyword)),
  );
  // 검색 중에는 결과를 전부 보여줍니다 — 찾는 사람이 잘려 있으면 검색이 무의미합니다
  const ordered = sortRows(matched, (member) => {
    if (sort.key === "cost") return member.costValue;
    if (sort.key === "activity") return member.idleDays === null ? null : -member.idleDays;
    return member[sort.key];
  }, sort.direction, (member) => member.account);
  const rows = keyword ? ordered : ordered.slice(0, limit);
  const hasMore = !keyword && matched.length > rows.length;

  return (
    <Widget
      label="구성원 목록"
      title="구성원"
      note={status === "all" ? model.memberNote(rows.length, keyword) : `${MEMBER_STATUS_LABELS[status]} ${matched.length}명 · ${rows.length}명 표시${keyword ? " · 검색 결과" : ""}`}
      className="col-span-full @max-[620px]:[&>div:first-child]:flex-col @max-[620px]:[&>div:first-child]:items-stretch [&>div:first-child>div>span:first-child]:shrink-0"
      action={
        <Input
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onCompositionStart={() => { composing.current = true; cancelSearch(); }}
          onCompositionEnd={(event) => {
            composing.current = false;
            changeQuery(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            applySearch(event.currentTarget.value);
          }}
          placeholder="이메일 · 팀 검색"
          aria-label="구성원 검색"
          className="w-[220px] max-w-full @max-[620px]:w-full"
        />
      }
    >
      <div ref={results} className="flex flex-col" style={{ minHeight: searchHeight ?? undefined }}>
      <div className="flex-1">
      <div className="overflow-x-auto">
      <div className="min-w-[850px]">
      <div className={`${COLS} border-b border-border px-0.5 pb-2 text-[11px] text-text3`}>
        <SortHeader label="사용자" direction={sort.key === "account" ? sort.direction : undefined} onClick={() => setSort(nextSort(sort, "account", "asc"))} />
        <SortHeader label="팀" direction={sort.key === "team" ? sort.direction : undefined} onClick={() => setSort(nextSort(sort, "team", "asc"))} />
        <span>역할</span>
        <SortHeader label="사용 환산액" align="right" initial="desc" direction={sort.key === "cost" ? sort.direction : undefined} onClick={() => setSort(nextSort(sort, "cost", "desc"))} />
        <SortHeader label="최근 관측" align="right" initial="desc" direction={sort.key === "activity" ? sort.direction : undefined} onClick={() => setSort(nextSort(sort, "activity", "desc"))} />
        <div className="pl-3">
          <FilterMenu label="상태" value={status} options={STATUS_OPTIONS} active={status !== "all"} onChange={(next) => {
              const height = Math.ceil(results.current?.getBoundingClientRect().height ?? 0);
              setSearchHeight((previous) => next === "all" && !keyword ? null : Math.max(previous ?? 0, height));
              setStatus(next);
              setLimit(PAGE);
            }} />
        </div>
        <span className="sr-only">상세</span>
      </div>

      {rows.map((m) => (
        <button key={m.account} type="button" onClick={() => onOpen(m)} aria-label={`${m.account} 구성원 상세`} aria-haspopup="dialog"
          className={`${COLS} w-full cursor-pointer border-b border-border px-0.5 py-3 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue`}>
          <span className="overflow-hidden text-[12.5px] text-ellipsis whitespace-nowrap">
            {m.account}
          </span>
          <span className="text-[12px]" style={{ color: m.teamColor }}>
            {m.team}
          </span>
          <span className="text-[12px] text-text2">{m.roleLabel}</span>
          <span className="tnum text-right text-[12px]">{m.costText}</span>
          <span className="tnum text-right text-[12px] whitespace-nowrap text-text3">{m.lastSeen}</span>
          <MemberStatusBadges status={m.seatStatus} className="pl-3" />
          <span aria-hidden="true" className="text-right text-lg text-text3">›</span>
        </button>
      ))}
      </div>
      </div>

      {rows.length === 0 && (
        <p className="py-6 text-center text-[12px] text-text3">
          {keyword ? "검색 결과가 없습니다" : status !== "all" ? "해당 상태의 구성원이 없습니다" : "등록된 구성원이 없습니다"}
        </p>
      )}
      </div>

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
      </div>
    </Widget>
  );
}
