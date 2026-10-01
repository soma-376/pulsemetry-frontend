"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ReclaimModal, type ReclaimTarget } from "@/components/members/ReclaimModal";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { createCommands, ManagementError, managementKey } from "@/lib/api/management";
import { assignSeat, IMPORT_ACTION_TEXT, IMPORT_ERROR_TEXT, importSeats, releaseSeat, SEAT_SOURCE_TEXT, SEAT_STATE_TEXT, seatImportSchema, seatReasonText,
  vendorSeatsOptions, type SeatImport, type VendorSeat } from "@/lib/api/seats";
import { int } from "@/lib/format";

/**
 * 등록 제품의 좌석(`GET O/vendors/{vendorId}/seats`)과 수동 기록(enrollment 명세 §12 "좌석 수동 기록"). 구매 수량으로 좌석을 만들지 않는다.
 * 단건 배정·해제와 CSV 가져오기는 관리자 기록이 권위인 제품(커넥터 없는 플랜, 연결 전)에서만 — 연결이 있으면 서버가 409로 거절한다.
 * CSV는 미리보기로 행별 계획·오류를 보여 주고, 오류가 없을 때만 적용한다. 파일에 없는 좌석은 그대로다.
 */
export function VendorSeats({ organizationId, vendorId, vendorName, manual, tiers, editable }: {
  organizationId: string; vendorId: string; vendorName: string;
  /** 관리자 기록이 권위인가(좌석 원천의 authority = manual) */
  manual: boolean;
  tiers: { tierId: string; label: string }[];
  editable: boolean;
}) {
  const client = useQueryClient();
  const [post] = useState(createCommands);
  const query = useInfiniteQuery(vendorSeatsOptions(organizationId, vendorId));
  const [account, setAccount] = useState("");
  const [tier, setTier] = useState("");
  const [csv, setCsv] = useState("");
  const [plan, setPlan] = useState<SeatImport | null>(null);
  const [reclaim, setReclaim] = useState<ReclaimTarget | null>(null);
  const refresh = () => {
    for (const name of ["vendor-seats", "settings", "settings-vendor", "members", "member-seats", "seat-reclaim-candidates"]) void client.invalidateQueries({ queryKey: managementKey(organizationId, name) });
  };
  const assign = useMutation({ mutationFn: () => assignSeat(post, organizationId, vendorId, { account, tierId: tier || null }), onSuccess: () => { setAccount(""); refresh(); } });
  const release = useMutation({ mutationFn: (seat: VendorSeat) => releaseSeat(post, organizationId, vendorId, seat.seatAssignmentId, seat.version), onSuccess: refresh });
  const preview = useMutation({ mutationFn: () => importSeats(post, organizationId, vendorId, "preview", csv), onSuccess: (result) => setPlan(result.import) });
  const apply = useMutation({ mutationFn: () => importSeats(post, organizationId, vendorId, "apply", csv), onSuccess: (result) => { setPlan(result.import); refresh(); },
    // 오류가 있으면 아무것도 적용하지 않고 행별 오류를 돌려준다(422 seat_import_invalid).
    onError: (error) => { if (error instanceof ManagementError && error.code === "seat_import_invalid") { const parsed = seatImportSchema.safeParse(error.details); if (parsed.success) setPlan(parsed.data); } } });

  const pages = query.data?.pages ?? [];
  const first = pages[0];
  const seats = pages.flatMap((page) => page.seats.items);
  const errors = plan ? plan.rows.filter((row) => row.errors.length).length : 0;
  const busy = assign.isPending || release.isPending || preview.isPending || apply.isPending;
  return <section aria-label="좌석" className="flex flex-col gap-3 rounded-md border border-border p-3 text-xs">
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold">좌석</span>
      <span className="text-text3">{first ? `${int(first.seats.totalCount)}석 기록` : ""}</span>
    </div>
    {first && first.ledgerAvailability !== "available" && <p className="text-orange-ink">{seatReasonText(first.ledgerReason)}</p>}
    {!first && query.isPending && <LoadingState variant="inline" message="좌석을 불러오는 중입니다…" />}
    {query.error && <ErrorState variant="inline" message={query.error.message} retrying={query.isFetching} onRetry={() => void query.refetch()} />}
    {first && !seats.length && <p className="text-text3">기록된 좌석이 없습니다. 구매 수량은 좌석이 아닙니다 — 누가 좌석을 갖고 있는지를 기록하세요.</p>}
    {seats.length > 0 && <ul aria-label={`${vendorName} 좌석 목록`} className="flex flex-col divide-y divide-border">
      {seats.map((seat) => <li key={seat.seatAssignmentId} className="flex flex-wrap items-center gap-2 py-2">
        <div className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="truncate font-medium">{seat.account}</span>
          <span className="text-[11px] text-text3">{SEAT_STATE_TEXT[seat.state]} · {seat.memberAccount ?? "구성원 미연결"} · {seat.tierLabel ?? seat.vendorTier ?? "유형 미지정"} · {SEAT_SOURCE_TEXT[seat.source] ?? seat.source}</span>
        </div>
        {editable && seat.canReclaim && <Button size="sm" variant="danger" onClick={() => setReclaim({ seatAssignmentId: seat.seatAssignmentId, version: seat.version, label: `${vendorName} · ${seat.account}` })}
          aria-label={`${seat.account} 좌석 회수`}>회수</Button>}
        {editable && manual && seat.state === "assigned" && <Button size="sm" loading={release.isPending && release.variables?.seatAssignmentId === seat.seatAssignmentId} loadingLabel="해제 중…"
          disabled={busy} onClick={() => release.mutate(seat)} aria-label={`${seat.account} 해제 기록`}>해제 기록</Button>}
      </li>)}
    </ul>}
    {query.hasNextPage && <Button size="sm" loading={query.isFetchingNextPage} loadingLabel="불러오는 중…" onClick={() => void query.fetchNextPage()}>더 보기</Button>}
    {release.error && <ErrorState variant="inline" message={release.error.message} />}

    {editable && manual && <>
      <form aria-label="좌석 배정 기록" className="flex flex-wrap items-end gap-2 border-t border-border pt-3" onSubmit={(event) => { event.preventDefault(); assign.mutate(); }}>
        <label className="flex min-w-48 flex-1 flex-col gap-1"><span className="text-[11px] text-text3">벤더 계정(이메일·GitHub 로그인)</span>
          <Input value={account} onChange={(event) => setAccount(event.target.value)} required /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-text3">좌석 유형</span>
          <select className="h-[30px] rounded-md border border-border bg-card px-2" value={tier} onChange={(event) => setTier(event.target.value)}>
            <option value="">미지정</option>{tiers.map((item) => <option key={item.tierId} value={item.tierId}>{item.label}</option>)}
          </select></label>
        <Button type="submit" size="sm" variant="primary" loading={assign.isPending} loadingLabel="기록 중…" disabled={busy || !account.trim()}>배정 기록</Button>
      </form>
      {assign.error && <ErrorState variant="inline" message={assign.error.message} />}
      {assign.data?.warnings.includes("exceeds_contracted_seats") && <p role="status" className="text-orange-ink">배정 좌석이 계약 수량보다 많습니다 — 계약을 확인하세요.</p>}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <label className="flex flex-col gap-1"><span className="text-[11px] text-text3">CSV 가져오기 — 열: account(필수)·status(assigned·released)·tier·member_email. 다른 열(이름 등)은 받지 않습니다.</span>
          <textarea aria-label="좌석 CSV" className="min-h-24 rounded-md border border-border bg-card p-2 font-mono text-[11px]" value={csv}
            onChange={(event) => { setCsv(event.target.value); setPlan(null); preview.reset(); apply.reset(); }} placeholder={"account,status,tier\ndev@example.com,assigned,Standard"} /></label>
        <input type="file" accept=".csv,text/csv" aria-label="CSV 파일" className="text-[11px]"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => { setCsv(text); setPlan(null); }); }} />
        <div className="flex gap-2"><div className="flex-1" />
          <Button size="sm" loading={preview.isPending} loadingLabel="확인 중…" disabled={busy || !csv.trim()} onClick={() => preview.mutate()}>미리보기</Button>
          <Button size="sm" variant="primary" loading={apply.isPending} loadingLabel="적용 중…" disabled={busy || !plan || plan.mode !== "preview" || errors > 0} onClick={() => apply.mutate()}>적용</Button>
        </div>
        {(preview.error && !(preview.error instanceof ManagementError && preview.error.code === "seat_import_invalid")) && <ErrorState variant="inline" message={preview.error.message} />}
        {apply.error && <ErrorState variant="inline" message={apply.error.message} />}
        {plan && <div aria-label="가져오기 결과" role="region" className="rounded-md bg-sub p-2">
          <p role="status" className="font-medium">{plan.applied ? "적용했습니다" : plan.mode === "preview" ? "미리보기" : "적용하지 않았습니다"} · {Object.entries(plan.summary).filter(([, value]) => value)
            .map(([key, value]) => `${key === "errors" ? "오류" : IMPORT_ACTION_TEXT[key] ?? key} ${int(value)}`).join(" · ") || "변경 없음"}</p>
          <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto">{plan.rows.map((row) => <li key={row.line} className={row.errors.length ? "text-red" : "text-text2"}>
            {row.line}행 {row.account || "(빈 계정)"} — {row.errors.length ? row.errors.map((error) => `${error.field}: ${IMPORT_ERROR_TEXT[error.code] ?? error.code}`).join(", ") : IMPORT_ACTION_TEXT[row.action ?? ""] ?? row.action}
          </li>)}</ul>
        </div>}
      </div>
    </>}
    {!manual && <p className="text-text3">벤더 연결이 있는 제품은 동기화가 좌석을 정합니다 — 직접 배정·해제·가져오기를 하지 않습니다.</p>}
    <ReclaimModal key={reclaim?.seatAssignmentId ?? "none"} organizationId={organizationId} target={reclaim} open={!!reclaim} onClose={() => setReclaim(null)} />
  </section>;
}
