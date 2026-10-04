"use client";

import { useDashboardHref } from "@/lib/filters";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Widget } from "@/components/ui/Card";
import type { OverviewTeamSummary } from "@/lib/metrics/overview-presentation";

type SortKey = "team" | "userCount" | "cost";
export function TeamUsageTable({ model }: { model: { attribution: OverviewTeamSummary } }) {
  const router = useRouter();
  const dashboardHref = useDashboardHref();
  const { attribution } = model;
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "cost", ascending: false });
  const rows = [...attribution.rows].sort((a, b) => {
    const left = a[sort.key], right = b[sort.key];
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    const order = typeof left === "string" && typeof right === "string" ? left.localeCompare(right, "ko") : Number(left) - Number(right);
    return (sort.ascending ? order : -order) || a.team.localeCompare(b.team, "ko");
  });
  const selectSort = (key: SortKey) => setSort((value) => ({ key, ascending: value.key === key ? !value.ascending : key === "team" }));
  const header = (key: SortKey, label: string) => <th scope="col" aria-sort={sort.key === key ? sort.ascending ? "ascending" : "descending" : "none"} className="py-2 text-left font-medium"><button type="button" onClick={() => selectSort(key)} className="cursor-pointer rounded py-1 hover:text-text">{label} <span aria-hidden="true">{sort.key === key ? sort.ascending ? "↑" : "↓" : "↕"}</span></button></th>;
  return <Widget label="팀별 요약" title="팀별 요약" note="선택 기간 기준" className="col-span-full" action={<Link href={dashboardHref("/teams")} className="shrink-0 text-xs text-text2">{attribution.moreLabel} 보기 →</Link>}>
    <div className="overflow-x-auto"><table aria-label="팀별 요약" className="w-full min-w-[560px] text-left text-xs">
      <thead className="border-b border-border text-[11px] text-text3"><tr>{header("team", "팀")}{header("userCount", "사용 관측 인원")}<th scope="col" className="font-medium">사용 벤더</th>{header("cost", "사용 환산액")}
        {attribution.comparable && <><th scope="col" className="font-medium">{attribution.compareLabel}</th><th scope="col" className="font-medium" title="조직 전체 환산액 변화 중 이 팀의 변화액">증가 기여</th></>}
        <th scope="col"><span className="sr-only">상세</span></th></tr></thead>
      <tbody>{rows.map((row) => {
        const href = dashboardHref(row.teamId ? `/teams?team=${encodeURIComponent(row.teamId)}` : "/teams");
        return <tr key={row.teamId ?? row.team} onClick={() => router.push(href)} className="cursor-pointer border-b border-border hover:bg-hover focus-within:bg-hover">
          <th scope="row" className="py-3 font-semibold"><Link href={href} onClick={(event) => event.stopPropagation()} className="rounded focus-visible:outline-2 focus-visible:outline-offset-4">{row.team}</Link></th>
          <td className="tnum py-3">{row.users === "-" ? "-" : `${row.users}명`}</td><td className="py-3 text-text2">{row.vendors === null ? "-" : row.vendors.join(" · ") || "미관측"}</td><td className="tnum py-3">{row.costText}</td>
          {attribution.comparable && <><td className="tnum py-3">{row.changeText}</td><td className="tnum py-3">{row.contribText}</td></>}
          <td aria-hidden="true" className="text-right text-lg text-text3">›</td>
        </tr>;
      })}
      {attribution.hasUnmapped && <tr className="text-text3"><th scope="row" className="py-3 font-normal">미배정</th><td className="tnum">{attribution.unmappedUsers === "-" ? "-" : `${attribution.unmappedUsers}명`}</td><td>{attribution.unmappedVendors === null ? "-" : attribution.unmappedVendors.join(" · ") || "미관측"}</td><td className="tnum">{attribution.unattributedCostText}</td>{attribution.comparable && <><td className="tnum">{attribution.unmapped.changeText}</td><td className="tnum">{attribution.unmapped.contribText}</td></>}<td /></tr>}</tbody>
    </table></div>
  </Widget>;
}
