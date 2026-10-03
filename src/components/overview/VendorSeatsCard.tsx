"use client";

import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { contractSeatsLabel, contractAmountLabel, type ContractStatus } from "@/lib/contract-status";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Widget } from "@/components/ui/Card";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { int, usd } from "@/lib/format";
import type { OverviewVendorDisplay } from "@/lib/metrics/overview-presentation";
import { seatReasonText } from "@/lib/api/seats";

const assignedText = (row: OverviewVendorDisplay["rows"][number]) => row.assigned == null ? (row.seatsReason ? seatReasonText(row.seatsReason) : "-") : `${int(row.assigned)}석`;

export function VendorSeatsCard({ model, message, onRetry }: { model: OverviewVendorDisplay; message?: string; onRetry?: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const single = model.rows.length === 1 ? model.rows[0] : null;
  const detail = model.rows.find((row) => row.id === selected);
  return <>
    <Widget label="계약·좌석 현황" title="계약·좌석 현황" className="col-span-full"
      action={<Link href="/settings" className="shrink-0 text-xs text-text2 hover:text-text">계약 설정 →</Link>}>
      <p className="mb-3 text-xs text-text3">사용 관측 인원은 선택 기간 기준 · 계약·배정 좌석과 회수 후보는 현재 기준{model.candidatesPartial ? " · 회수 후보는 판정한 좌석만" : ""}</p>
      {message && <div role={onRetry ? "alert" : "status"} className="mb-3 flex items-center gap-3 text-xs text-text3">{message}{onRetry && <Button onClick={onRetry}>계약 다시 조회</Button>}</div>}
      {single ? <div className="flex flex-col gap-4" data-vendor-id={single.id}>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded" style={{ background: single.color }} /><h3 className="text-base font-semibold">{single.name}</h3><ContractStatusBadge status={single.contractStatus} /></div>
        <dl className="grid grid-cols-4 gap-4 rounded-lg bg-sub p-4 @max-[700px]:grid-cols-2">
          {[[contractSeatsLabel(single.contractStatus), single.purchased === null ? "-" : `${int(single.purchased)}석`], ["사용 관측 인원", single.observedUsers === null ? "-" : single.observedUsers ? `${int(single.observedUsers)}명` : "미관측"], ["회수 후보", single.candidates === null ? "-" : `${int(single.candidates)}석`], [contractAmountLabel(single.contractStatus), single.monthly === null ? "-" : usd(single.monthly)]].map(([label, value]) => <div key={label}><dt className="text-xs text-text3">{label}</dt><dd className="tnum mt-1.5 text-lg font-semibold" style={{ color: label === "회수 후보" && single.candidates ? "var(--orange-ink)" : undefined }}>{value}</dd></div>)}
        </dl>
        {single.purchased !== null && single.status === "확인 대기" && <p className="text-xs text-text3">일부 계약 확인 대기</p>}
        <VendorContracts contracts={single.contracts} status={single.contractStatus} startDate={single.startDate} />
      </div> : <div className="overflow-x-auto">
        <table aria-label="계약·좌석 현황" className="w-full min-w-[680px] text-left text-xs">
          <thead className="border-y border-border text-[11px] text-text3"><tr>
            {["벤더", "계약 좌석", "사용 관측 인원", "회수 후보", "월 좌석 계약액", ""].map((label, i) => <th key={i} scope="col" className="px-3 py-2 font-medium first:pl-0 last:pr-0">{label || <span className="sr-only">상세</span>}</th>)}
          </tr></thead>
          <tbody>{model.rows.map((row) => <tr key={row.id} data-vendor-id={row.id} onClick={() => { setSelected(row.id); setOpen(true); }} className="group cursor-pointer border-b border-border last:border-0 hover:bg-hover focus-within:bg-hover">
            <td className="py-3 pr-3"><button type="button" aria-label={`${row.name} 벤더 상세`} onClick={(event) => { event.stopPropagation(); setSelected(row.id); setOpen(true); }} className="cursor-pointer rounded text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">{row.name}</button><div className="mt-1"><ContractStatusBadge status={row.contractStatus} /></div></td>
            <td className="tnum px-3 py-3">{row.contractStatus !== "active" && <div className="mb-1 text-[11px] text-text3">{contractSeatsLabel(row.contractStatus)}</div>}{row.purchased === null ? "-" : `${int(row.purchased)}석`}{row.purchased !== null && row.status === "확인 대기" && <span className="ml-1 text-text3">일부 확인 대기</span>}
              {row.assigned !== undefined && <div className="mt-1 text-[11px] text-text3">배정 {assignedText(row)}</div>}</td>
            <td className="tnum px-3 py-3">{row.observedUsers === null ? "-" : row.observedUsers ? `${int(row.observedUsers)}명` : <span className="text-text3">미관측</span>}</td>
            <td className="tnum px-3 py-3"><span className={row.candidates ? "font-medium text-orange-ink" : "text-text3"}>{row.candidates === null ? "-" : `${int(row.candidates)}석`}</span></td>
            <td className="tnum px-3 py-3">{row.contractStatus !== "active" && <div className="mb-1 text-[11px] text-text3">{contractAmountLabel(row.contractStatus)}</div>}{row.monthly === null ? "-" : usd(row.monthly)}</td>
            <td aria-hidden="true" className="py-3 text-right text-lg text-text3">›</td>
          </tr>)}</tbody>
        </table>
        {!message && !model.rows.length && <p className="py-6 text-center text-xs text-text3">등록된 계약이나 관측된 벤더가 없습니다.</p>}
      </div>}
    </Widget>
    <DetailDrawer open={open && !!detail} onClose={() => setOpen(false)} title={detail ? `${detail.name} 현황` : "벤더 현황"} subtitle={`좌석 상태 기준 ${model.snapshotDate.replaceAll("-", ".")}`} footer={<Link href="/settings" className="text-xs font-medium hover:underline">계약 설정으로 이동 →</Link>}>
      {detail && <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">{[["사용 관측 인원 · 선택 기간", detail.observedUsers === null ? "-" : detail.observedUsers ? `${int(detail.observedUsers)}명` : "미관측"], ["회수 후보 · 현재", detail.candidates === null ? "-" : `${int(detail.candidates)}석`],
          ...(detail.assigned !== undefined ? [["배정 좌석 · 현재(좌석 원장)", assignedText(detail)]] : [])].map(([label, value]) => <div key={label} className="rounded-lg border border-border p-3"><p className="text-[11px] text-text3">{label}</p><p className="mt-2 font-semibold">{value}</p></div>)}</div>
        <section><h3 className="mb-3 text-sm font-semibold">플랜·좌석 유형</h3>
          <ContractStatusBadge status={detail.contractStatus} /><VendorContracts contracts={detail.contracts} status={detail.contractStatus} startDate={detail.startDate} />
        </section>
      </div>}
    </DetailDrawer>
  </>;
}


function VendorContracts({ contracts, status, startDate }: { contracts: OverviewVendorDisplay["rows"][number]["contracts"]; status: ContractStatus; startDate?: string }) {
  return <>
          <div className="flex flex-col gap-3">{contracts.map((contract) => <div key={contract.id} className="rounded-lg border border-border p-4">
            <p className="text-sm font-semibold">{contract.plan}</p><p className="mt-1 text-xs text-text3">{contract.name}</p>
            {!contract.tiers.length ? <p className="mt-3 text-xs text-text3">계약 미등록</p> : <><div className="mt-3 flex flex-col gap-2">{contract.tiers.map((tier, index) => <div key={index} className="flex justify-between gap-3 text-xs"><span>{tier.label} · {int(tier.seats)}석</span><span className="tnum">{usd(tier.fee)} / 석·월</span></div>)}</div><p className="mt-3 border-t border-border pt-3 text-xs">{contractAmountLabel(status)} · 월 {usd(contract.tiers.reduce((sum, tier) => sum + tier.seats * tier.fee, 0))}</p></>}
            {startDate && <p className="mt-2 text-[11px] text-text3">계약 시작일 {startDate.replaceAll("-", ".")}</p>}
            {contract.term && <p className="mt-2 text-[11px] text-text3">계약 종료일 {contract.term.replaceAll("-", ".")}</p>}
          </div>)}</div>
          {!contracts.length && <p className="text-xs text-text3">계약 미등록</p>}
  </>;
}
