"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { createCommands, managementKey } from "@/lib/api/management";
import { operationOptions } from "@/lib/api/operations";
import { CHECK_TEXT, deleteConnection, requestSync, saveConnection, seatReasonText, SYNC_TEXT, verifyConnection, type SeatSource } from "@/lib/api/seats";
import { settingsVendorOptions, type SettingsVendor } from "@/lib/api/settings";

const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";
const CAPABILITY_TEXT: Record<string, string> = { seat_list: "좌석 조회", seat_release: "해지", seat_restore: "복원", billing: "청구 조회" };

/**
 * 등록 제품의 좌석 원천과 벤더 연결(enrollment 명세 §12 "벤더 연결", 서버 ADR 0048). 연결 상태는 현재 값이라 상세를 따로 다시 읽는다.
 * 자격증명은 입력해 보내기만 한다 — 저장한 뒤 화면·브라우저 저장소에 다시 두지 않고, 서버도 응답에 싣지 않는다(설정됨 여부와 갱신 시각만).
 */
export function VendorSeatSource({ organizationId, vendor, editable }: { organizationId: string; vendor: SettingsVendor; editable: boolean }) {
  const client = useQueryClient();
  const [post] = useState(createCommands);
  const query = useQuery({ ...settingsVendorOptions(organizationId, vendor.vendorId), initialData: vendor });
  const source: SeatSource | undefined = query.data.seatSource;
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [credential, setCredential] = useState("");
  const [removing, setRemoving] = useState(false);
  const [syncOperation, setSyncOperation] = useState<string | null>(null);
  const sync = useQuery({ ...operationOptions(organizationId, syncOperation) });
  const refresh = () => {
    for (const name of ["settings-vendor", "settings", "vendor-seats", "members", "member-seats"]) void client.invalidateQueries({ queryKey: managementKey(organizationId, name) });
  };
  const save = useMutation({
    mutationFn: () => saveConnection(organizationId, vendor.vendorId, source?.connection?.version ?? 0, form ?? {}, credential),
    onSuccess: () => { setForm(null); refresh(); },
    // 성공하든 실패하든 입력한 자격증명은 지운다 — 다시 보여 주지 않는다.
    onSettled: () => setCredential(""),
  });
  const verify = useMutation({ mutationFn: () => verifyConnection(organizationId, vendor.vendorId), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteConnection(organizationId, vendor.vendorId, source!.connection!.version), onSuccess: () => { setRemoving(false); refresh(); } });
  const requested = useMutation({ mutationFn: () => requestSync(post, organizationId, vendor.vendorId), onSuccess: (operation) => setSyncOperation(operation.operationId) });
  if (!source) return null;
  const connection = source.connection;
  const busy = save.isPending || verify.isPending || remove.isPending || requested.isPending;
  const error = save.error ?? verify.error ?? remove.error ?? requested.error;
  const syncDone = sync.data?.operation;
  return <section aria-label="좌석 원천" className="flex flex-col gap-3 rounded-md border border-border p-3 text-xs">
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold">좌석 원천</span>
      <span className="text-text2">{source.authority === "connector" ? "벤더 동기화" : source.provisional ? "관리자 기록(연결 전 임시)" : "관리자 기록"}</span>
    </div>
    {!source.connector && <p className="text-text3">이 플랜은 벤더 API가 없어 관리자의 기록이 좌석의 원천입니다. 회수는 벤더 콘솔에서 해지한 뒤 확인합니다.</p>}
    {source.connector && <p className="text-text3">커넥터 {source.connector.connectorId} · 구현한 기능 {source.connector.capabilities.map((item) => CAPABILITY_TEXT[item] ?? item).join("·")}</p>}
    {connection && <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      <div><dt className="text-[11px] text-text3">자격증명</dt><dd>설정됨 · {time(connection.credential.updatedAt)}</dd></div>
      <div><dt className="text-[11px] text-text3">연결 확인</dt><dd>{CHECK_TEXT[connection.check.status] ?? connection.check.status}{connection.check.checkedAt ? ` · ${time(connection.check.checkedAt)}` : ""}</dd></div>
      <div><dt className="text-[11px] text-text3">좌석 동기화</dt><dd>{SYNC_TEXT[connection.sync.status]}{connection.sync.lastError ? ` · ${seatReasonText(connection.sync.lastError)}` : ""}</dd></div>
      <div><dt className="text-[11px] text-text3">마지막 성공</dt><dd className="tnum">{time(connection.sync.lastSucceededAt)}</dd></div>
      {connection.billing && <div className="col-span-2"><dt className="text-[11px] text-text3">청구 누계 읽기</dt>
        <dd>{SYNC_TEXT[connection.billing.status]}{connection.billing.lastError ? ` · ${seatReasonText(connection.billing.lastError)}` : ""} · 마지막 성공 {time(connection.billing.lastSucceededAt)}</dd></div>}
      {Object.keys(connection.settings).length > 0 && <div className="col-span-2"><dt className="text-[11px] text-text3">설정</dt>
        <dd>{Object.entries(connection.settings).map(([key, value]) => `${key}=${value}`).join(" · ")}</dd></div>}
    </dl>}
    {source.connector && editable && !form && <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => { setForm(Object.fromEntries(source.connector!.settingKeys.map((key) => [key, connection?.settings[key] ?? ""]))); save.reset(); }}>
        {connection ? "자격증명 교체" : "연결 추가"}</Button>
      {connection && <>
        <Button size="sm" loading={verify.isPending} loadingLabel="확인 중…" disabled={busy} onClick={() => verify.mutate()}>연결 확인</Button>
        <Button size="sm" loading={requested.isPending} loadingLabel="요청 중…" disabled={busy} onClick={() => requested.mutate()}>지금 동기화</Button>
        <Button size="sm" className="text-red" disabled={busy} onClick={() => setRemoving(true)}>연결 삭제</Button>
      </>}
    </div>}
    {form && <form aria-label="벤더 연결" className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      {Object.keys(form).map((key) => <label key={key} className="flex flex-col gap-1"><span className="text-[11px] text-text3">{key}</span>
        <Input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required /></label>)}
      <label className="flex flex-col gap-1"><span className="text-[11px] text-text3">관리자 자격증명(저장 후 다시 보이지 않습니다)</span>
        <Input type="password" autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)} required /></label>
      <div className="flex gap-2"><div className="flex-1" />
        <Button type="button" size="sm" disabled={save.isPending} onClick={() => { setForm(null); setCredential(""); }}>취소</Button>
        <Button type="submit" size="sm" variant="primary" loading={save.isPending} loadingLabel="저장 중…" disabled={!credential}>연결 저장</Button>
      </div>
    </form>}
    {removing && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-red bg-red-tint px-3 py-2">
      <span className="flex-1">연결을 지우면 자격증명이 즉시 삭제되고 좌석은 관리자 기록으로 돌아갑니다(지금 좌석은 그대로).</span>
      <Button size="sm" disabled={busy} onClick={() => setRemoving(false)}>되돌리기</Button>
      <Button size="sm" loading={remove.isPending} loadingLabel="삭제 중…" disabled={busy} onClick={() => remove.mutate()}>연결 삭제 확인</Button>
    </div>}
    {syncOperation && <p role="status" className="text-text2">동기화 요청 · {syncDone ? ({ pending: "다음 주기를 기다리는 중", running: "진행 중", succeeded: "완료", failed: `실패 · ${seatReasonText(syncDone.results[0]?.reason)}`, partially_failed: "일부 실패", awaiting_admin_action: "조치 대기" } as const)[syncDone.status] : "접수됨"}</p>}
    {error && <ErrorState variant="inline" message={error.message} />}
  </section>;
}
