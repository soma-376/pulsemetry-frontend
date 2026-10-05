"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ReclaimModal, type ReclaimTarget } from "@/components/members/ReclaimModal";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { createCommands, ManagementError, managementKey } from "@/lib/api/management";
import { assignSeat, correctSeat, IMPORT_ACTION_TEXT, IMPORT_ERROR_TEXT, importSeats, releaseSeat, SEAT_SOURCE_TEXT, SEAT_STATE_TEXT, seatImportSchema, seatReasonText,
  vendorSeatsOptions, type SeatImport, type VendorSeat } from "@/lib/api/seats";
import { int } from "@/lib/format";

/**
 * 등록 제품의 좌석(`GET O/vendors/{vendorId}/seats`)과 수동 기록(enrollment 명세 §12 "좌석 수동 기록"). 구매 수량으로 좌석을 만들지 않는다.
 * 단건 배정·해제와 CSV 가져오기는 관리자 기록이 권위인 제품(커넥터 없는 플랜, 연결 전)에서만 — 연결이 있으면 서버가 409로 거절한다.
 * CSV는 미리보기로 행별 계획·오류를 보여 주고, 오류가 없을 때만 적용한다. 파일에 없는 좌석은 그대로다.
 * 보정(메모·계약 등급·구성원 연결)은 권위와 무관하게 된다 — 연결이 있는 제품에서도 고칠 수 있고, 상태·원천은 바뀌지 않는다.
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
  const [note, setNote] = useState("");
  // 고치는 좌석과 다시 불러온 횟수 — 충돌 뒤 "최신 값으로 다시 편집"이 편집기를 새 값으로 다시 연다.
  const [editing, setEditing] = useState<{ seatAssignmentId: string; round: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [csv, setCsv] = useState("");
  const [plan, setPlan] = useState<SeatImport | null>(null);
  const [reclaim, setReclaim] = useState<ReclaimTarget | null>(null);
  const refresh = () => {
    for (const name of ["vendor-seats", "settings", "settings-vendor", "members", "member-seats", "seat-reclaim-candidates"]) void client.invalidateQueries({ queryKey: managementKey(organizationId, name) });
  };
  const assign = useMutation({ mutationFn: () => assignSeat(post, organizationId, vendorId, { account, tierId: tier || null, note: note.trim() ? note.trim() : null }),
    onSuccess: () => { setAccount(""); setNote(""); refresh(); } });
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
    {first && first.ledgerAvailability !== "available" && first.ledgerReason !== "seat_source_not_recorded" && <p className="text-orange-ink">{seatReasonText(first.ledgerReason)}</p>}
    {!first && query.isPending && <LoadingState variant="inline" message="좌석을 불러오는 중입니다…" />}
    {query.error && <ErrorState variant="inline" message={query.error.message} retrying={query.isFetching} onRetry={() => void query.refetch()} />}
    {first && !seats.length && <p className="text-text3">기록된 좌석이 없습니다.</p>}
    {seats.length > 0 && <ul aria-label={`${vendorName} 좌석 목록`} className="flex flex-col divide-y divide-border">
      {seats.map((seat) => <li key={seat.seatAssignmentId} className="flex flex-wrap items-center gap-2 py-2">
        <div className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="truncate font-medium">{seat.account}</span>
          <span className="text-[11px] text-text3">{SEAT_STATE_TEXT[seat.state]} · {seat.memberAccount ?? "구성원 미연결"} · {seat.tierLabel ?? seat.vendorTier ?? "유형 미지정"} · {SEAT_SOURCE_TEXT[seat.source] ?? seat.source}</span>
        </div>
        {editable && <Button size="sm" disabled={busy || editing?.seatAssignmentId === seat.seatAssignmentId} onClick={() => { setNotice(""); setEditing({ seatAssignmentId: seat.seatAssignmentId, round: 0 }); }}
          aria-label={`${seat.account} 좌석 정보 수정`}>수정</Button>}
        {editable && seat.canReclaim && <Button size="sm" variant="danger" onClick={() => setReclaim({ seatAssignmentId: seat.seatAssignmentId, version: seat.version, label: `${vendorName} · ${seat.account}` })}
          aria-label={`${seat.account} 좌석 회수`}>회수</Button>}
        {editable && manual && seat.state === "assigned" && <Button size="sm" loading={release.isPending && release.variables?.seatAssignmentId === seat.seatAssignmentId} loadingLabel="해제 중…"
          disabled={busy} onClick={() => release.mutate(seat)} aria-label={`${seat.account} 해제 기록`}>해제 기록</Button>}
        {seat.note && editing?.seatAssignmentId !== seat.seatAssignmentId && <p className="w-full text-[11px] text-text2">메모: {seat.note}</p>}
        {editing?.seatAssignmentId === seat.seatAssignmentId && <SeatEditor key={`${seat.seatAssignmentId}-${editing.round}`} organizationId={organizationId} vendorId={vendorId} seat={seat} tiers={tiers}
          onSaved={(message) => { setEditing(null); setNotice(message); refresh(); }} onCancel={() => setEditing(null)}
          onReload={async () => { await query.refetch(); setEditing((value) => value && { ...value, round: value.round + 1 }); }} />}
      </li>)}
    </ul>}
    {query.hasNextPage && <Button size="sm" loading={query.isFetchingNextPage} loadingLabel="불러오는 중…" onClick={() => void query.fetchNextPage()}>더 보기</Button>}
    {release.error && <ErrorState variant="inline" message={release.error.message} />}
    {notice && <p role="status" className="text-text2">{notice}</p>}

    {editable && manual && <>
      <form aria-label="좌석 배정 기록" className="flex flex-wrap items-end gap-2 border-t border-border pt-3" onSubmit={(event) => { event.preventDefault(); assign.mutate(); }}>
        <label className="flex min-w-48 flex-1 flex-col gap-1"><span className="text-[11px] text-text3">벤더 계정(이메일)</span>
          <Input value={account} onChange={(event) => setAccount(event.target.value)} required /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-text3">좌석 유형</span>
          <select className="h-[30px] rounded-md border border-border bg-card px-2" value={tier} onChange={(event) => setTier(event.target.value)}>
            <option value="">미지정</option>{tiers.map((item) => <option key={item.tierId} value={item.tierId}>{item.label}</option>)}
          </select></label>
        <label className="flex min-w-40 flex-1 flex-col gap-1"><span className="text-[11px] text-text3">메모(선택)</span>
          <Input value={note} maxLength={NOTE_LIMIT} onChange={(event) => setNote(event.target.value)} aria-label="배정 메모" /></label>
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

/** 서버의 메모 한도(enrollment 명세 "좌석 수동 기록" — 빈 메모는 null 로 지운다). */
const NOTE_LIMIT = 1000;
type MemberLinkChoice = "keep" | "automatic" | "none";

/**
 * 좌석 하나의 보정(`PATCH …/seats/{id}` — 메모·계약 등급·구성원 연결). 판(`expectedVersion`)을 함께 보내고, 다른 곳에서 먼저 바꿨으면(409)
 * 입력을 그대로 둔 채 알리고 최신 값으로 다시 편집하게 한다 — 자동으로 덮어쓰지 않는다. 바꾼 칸만 보낸다.
 * 구성원은 특정 구성원 지정 대신 "이메일 일치 규칙으로 되돌리기"·"잇지 않음"만 고른다(구성원 목록 선택은 이 편집기의 범위가 아니다).
 */
function SeatEditor({ organizationId, vendorId, seat, tiers, onSaved, onCancel, onReload }: {
  organizationId: string; vendorId: string; seat: VendorSeat; tiers: { tierId: string; label: string }[];
  onSaved: (message: string) => void; onCancel: () => void; onReload: () => Promise<void>;
}) {
  const [base] = useState(seat);
  const [note, setNote] = useState(seat.note ?? "");
  const [tier, setTier] = useState(seat.tierId ?? "");
  const [link, setLink] = useState<MemberLinkChoice>("keep");
  const changes = {
    ...(note.trim() !== (base.note ?? "") ? { note: note.trim() ? note.trim() : null } : {}),
    ...(tier !== (base.tierId ?? "") ? { tierId: tier || null } : {}),
    ...(link === "automatic" ? { memberLink: "automatic" as const } : link === "none" ? { memberId: null } : {}),
  };
  const save = useMutation({ retry: false, mutationFn: () => correctSeat(organizationId, vendorId, base.seatAssignmentId, { expectedVersion: base.version, ...changes }),
    onSuccess: () => onSaved(`${base.account} 좌석 정보를 고쳤습니다. 좌석 상태와 원천은 그대로입니다.`) });
  const reload = useMutation({ retry: false, mutationFn: onReload });
  const conflict = save.error instanceof ManagementError && save.error.code === "version_conflict";
  const nothing = !Object.keys(changes).length;
  return <form aria-label={`${base.account} 좌석 정보 수정`} className="flex w-full flex-col gap-2 rounded-md bg-sub p-2"
    onSubmit={(event) => { event.preventDefault(); if (!nothing && !save.isPending && !conflict) save.mutate(); }}>
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-48 flex-1 flex-col gap-1"><span className="text-[11px] text-text3">메모</span>
        <Input value={note} maxLength={NOTE_LIMIT} onChange={(event) => { setNote(event.target.value); save.reset(); }} aria-label="좌석 메모" /></label>
      <label className="flex flex-col gap-1"><span className="text-[11px] text-text3">좌석 유형</span>
        <select aria-label="좌석 유형" className="h-[30px] rounded-md border border-border bg-card px-2" value={tier} onChange={(event) => { setTier(event.target.value); save.reset(); }}>
          <option value="">미지정</option>{tiers.map((item) => <option key={item.tierId} value={item.tierId}>{item.label}</option>)}
          {base.tierId && !tiers.some((item) => item.tierId === base.tierId) && <option value={base.tierId}>{base.tierLabel ?? base.tierId}</option>}
        </select></label>
      <label className="flex flex-col gap-1"><span className="text-[11px] text-text3">구성원 연결</span>
        <select aria-label="구성원 연결" className="h-[30px] rounded-md border border-border bg-card px-2" value={link} onChange={(event) => { setLink(event.target.value as MemberLinkChoice); save.reset(); }}>
          <option value="keep">그대로({base.memberAccount ?? "미연결"})</option>
          <option value="automatic">이메일 일치 규칙으로</option>
          <option value="none">잇지 않음</option>
        </select></label>
    </div>
    {save.error && <ErrorState variant="inline" message={conflict ? "다른 곳에서 이 좌석을 먼저 바꿨습니다. 입력은 그대로 두었습니다 — 최신 값을 불러와 다시 편집하세요." : save.error.message}>
      {conflict && <Button size="sm" loading={reload.isPending} loadingLabel="불러오는 중…" onClick={() => reload.mutate()}>최신 값으로 다시 편집</Button>}
    </ErrorState>}
    <div className="flex gap-2"><div className="flex-1" />
      <Button size="sm" onClick={onCancel} disabled={save.isPending}>취소</Button>
      <Button type="submit" size="sm" variant="primary" loading={save.isPending} loadingLabel="저장 중…" disabled={nothing || conflict}>저장</Button>
    </div>
  </form>;
}
