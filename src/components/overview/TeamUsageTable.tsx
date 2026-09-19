"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ProgressBar } from "@/components/charts/ProgressBar";
import { Widget } from "@/components/ui/Card";
import type { OverviewModel } from "@/lib/metrics/overview";

type SortKey = "team" | "userCount" | "cost" | "perUser" | "contrib";
const HEADERS: { key: SortKey; label: string }[] = [
  { key: "team", label: "팀" }, { key: "userCount", label: "사용자" },
  { key: "cost", label: "환산가치" }, { key: "perUser", label: "사용자당" },
  { key: "contrib", label: "증가 기여" },
];

export function TeamUsageTable({ model }: { model: OverviewModel }) {
  const { attribution, defs, compareLabel } = model;
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "cost", ascending: false });
  const topTeams = [...attribution.rows].sort((a, b) => b.cost - a.cost).slice(0, 3);
  const rows = [...topTeams].sort((a, b) => {
    const order = sort.key === "team" ? a.team.localeCompare(b.team, "ko") : a[sort.key] - b[sort.key];
    return sort.ascending ? order : -order;
  });
  const selectSort = (key: SortKey) => setSort((value) => ({ key, ascending: value.key === key ? !value.ascending : key === "team" }));

  return (
    <Widget id="w17" label="팀별 사용량" title="팀별 사용량" note={`환산가치 상위 3팀${compareLabel ? ` · ${compareLabel}` : ""}`} def={defs.w17} className="col-span-3 @max-[1023px]:col-span-full"
      action={<Link href="/teams" className="text-[11px] font-medium whitespace-nowrap">{attribution.moreLabel} 보기 →</Link>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12px]">
          <thead><tr className="border-b border-border text-[11px] text-text3">
            {HEADERS.map((header) => (
              <th key={header.key} scope="col" aria-sort={sort.key === header.key ? sort.ascending ? "ascending" : "descending" : "none"} className={header.key === "team" ? "pb-2 text-left" : "pb-2 text-right"}>
                <button type="button" onClick={() => selectSort(header.key)} disabled={header.key === "contrib" && !model.showDelta} className="cursor-pointer rounded px-1 py-1 font-medium hover:bg-hover disabled:cursor-default disabled:opacity-50">
                  {header.label} <span aria-hidden="true">{sort.key === header.key ? sort.ascending ? "↑" : "↓" : "↕"}</span>
                </button>
              </th>
            ))}
            <th scope="col" className="pb-2 pl-3 text-left font-medium">주요 모델</th>
          </tr></thead>
          <tbody>
            {rows.map((row) => (
              <motion.tr layout="position" key={row.team} transition={{ type: "spring", stiffness: 400, damping: 35 }} className="group border-b border-border transition-colors hover:bg-hover focus-within:bg-hover">
                <th scope="row" className="py-3 text-left font-semibold">
                  <span className="px-1">{row.team}</span>
                </th>
                <td className="tnum px-1 py-3 text-right text-text2">{row.users}</td>
                <td className="tnum px-1 py-3 text-right">{row.costText}</td>
                <td className="tnum px-1 py-3 text-right"><div>{row.perUserText}</div>{model.showDelta && <div className="text-[10px]" style={{ color: row.perUserColor }}>{row.perUserDelta}</div>}</td>
                <td className="px-2 py-3"><div className="flex items-center justify-end gap-2"><ProgressBar width={row.barWidth} color={row.barColor} height={6} className="w-12" /><span className="tnum min-w-12 text-right" style={{ color: row.contribColor }}>{row.contribText}</span></div></td>
                <td className="py-3 pl-3 text-[11px] text-text2">{row.cause}</td>
              </motion.tr>
            ))}
            <tr className="text-text3"><th scope="row" className="py-3 text-left font-normal">미배분</th><td className="tnum px-1 text-right">{attribution.unmappedUsers}</td><td className="tnum px-1 text-right">{attribution.unattributedCostText}</td><td className="tnum px-1 text-right">{attribution.unmappedPerUserText}</td><td className="tnum px-2 text-right">{attribution.unattrText}</td><td className="pl-3 text-[11px]">팀 귀속 실패</td></tr>
          </tbody>
        </table>
      </div>
      {!model.showDelta && model.compare !== "none" && <p className="mt-2 text-[11px] text-text3">{model.noDeltaReason} · 증가 기여를 표시하지 않습니다</p>}

    </Widget>
  );
}
