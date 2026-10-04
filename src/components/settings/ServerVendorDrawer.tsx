"use client";

import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { contractAmountLabel } from "@/lib/contract-status";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ContractForm } from "./ContractForm";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { NEW_CONTRACT_ROW } from "@/lib/contracts";
import { currentDateIso } from "@/lib/date";
import { int, usd } from "@/lib/format";
import { type VendorDraft } from "@/lib/settings";
import { serverVendorSchema, validateServerTiers } from "@/lib/schemas/server-contract";
import { settingsVendorDraft, settingsVendorRow } from "@/lib/settings-vendors";
import { catalogOptions, plansOptions } from "@/lib/api/vendor-catalog";
import { apiJson, createCommands, ManagementError, orgPath } from "@/lib/api/management";
import { fetchSettingsVendor, settingsVendorResponseSchema, type SettingsVendor } from "@/lib/api/settings";
import { organizationKey } from "@/lib/api/query-keys";

export function ServerVendorDrawer({ organizationId, initial, registeredKinds, editable, open, onClose, onAfterClose, onSaved, onAccessDenied }: {
  organizationId: string; initial: SettingsVendor | null; registeredKinds: string[]; editable: boolean;
  open: boolean; onClose: () => void; onAfterClose: () => void; onSaved: (message: string) => void; onAccessDenied: (error: Error) => void;
}) {
  const client = useQueryClient();
  const [current, setCurrent] = useState(initial);
  const [draft, setDraft] = useState<VendorDraft>(() => settingsVendorDraft(initial ?? undefined));
  const [confirm, setConfirm] = useState<"vendor" | "contract" | null>(null);
  const [post] = useState(createCommands);
  const inFlight = useRef(false);
  const catalog = useQuery(catalogOptions(organizationId));
  const plans = useQuery(plansOptions(organizationId, draft.kind ?? "", catalog.data?.catalogVersion));
  const product = catalog.data?.items.find(item => item.id === draft.kind);
  const options = current ? catalog.data?.items ?? [] : (catalog.data?.items ?? []).filter(item => !registeredKinds.includes(item.id));
  const baseline = settingsVendorDraft(current ?? undefined);
  const changed = JSON.stringify(draft) !== JSON.stringify(baseline);
  const validation = serverVendorSchema(product, plans.data?.plans ?? [], currentDateIso(), current?.contract ?? undefined).safeParse(draft);
  const clearing = !!current?.contract && !draft.plan;
  const summary = validateServerTiers(draft.tiers ?? [], product?.allowsSeatTiers ?? false);
  const plan = plans.data?.plans.find(item => item.id === draft.plan);
  const row = current ? settingsVendorRow(current, product) : NEW_CONTRACT_ROW;
  // 지운 제품의 조회(상세·좌석)는 다시 읽지 않는다 — 서버에 없는 제품이라 404 다. 창이 닫히면 버려진다.
  const refresh = (removed?: string) => client.invalidateQueries({ queryKey: organizationKey(organizationId), predicate: (query) => !removed || !query.queryKey.includes(removed) });
  const mutation = useMutation({
    retry: false,
    mutationFn: async (action: "save" | "vendor" | "contract") => {
      if (action !== "save") {
        if (!current) throw new Error("등록한 제품을 확인하세요.");
        await apiJson("enrollment", orgPath(organizationId, `/vendors/${current.vendorId}${action === "contract" ? "/contract" : ""}`), z.undefined(), {
          method: "DELETE", headers: { "If-Match": `"vendor-${current.version}"` },
        });
        return action === "contract" ? "계약 정보를 비웠습니다." : "벤더를 삭제했습니다.";
      }
      if (!validation.success || clearing) throw new Error("입력한 계약 정보를 확인하세요.");
      const body = validation.data;
      if (!current) {
        await post(organizationId, "/vendors", body, settingsVendorResponseSchema);
      } else {
        // 이름만 바뀌면 계약을 재작성하지 않는다. 계약 없는 제품도 같은 PATCH를 사용한다.
        const nameOnly = JSON.stringify({ ...draft, name: baseline.name }) === JSON.stringify(baseline);
        const contract = body.contract;
        await apiJson("enrollment", orgPath(organizationId, `/vendors/${current.vendorId}${contract && !nameOnly ? "/contract" : ""}`), settingsVendorResponseSchema, {
          method: contract && !nameOnly ? "PUT" : "PATCH",
          body: JSON.stringify({ expectedVersion: current.version, displayName: body.displayName, ...(contract && !nameOnly ? { contract } : {}) }),
        });
      }
      return current ? "변경사항을 저장했습니다." : "벤더를 추가했습니다.";
    },
    onSuccess: (message, action) => { onSaved(message); onClose(); void refresh(action === "vendor" ? current?.vendorId : undefined); },
    onError: error => { if (error instanceof ManagementError && [401, 403].includes(error.status)) onAccessDenied(error); },
    onSettled: () => { inFlight.current = false; },
  });
  const reload = useMutation({ mutationFn: async () => {
    if (!current) return;
    const latest = await fetchSettingsVendor(organizationId, current.vendorId);
    setCurrent(latest); setDraft(settingsVendorDraft(latest)); setConfirm(null); mutation.reset();
  }, onError: error => { if (error instanceof ManagementError && [401, 403].includes(error.status)) onAccessDenied(error); } });
  const busy = mutation.isPending || reload.isPending;
  const conflict = mutation.error instanceof ManagementError && mutation.error.code === "version_conflict";
  const restricted = mutation.error instanceof ManagementError && [401, 403].includes(mutation.error.status);
  const submit = (action: "save" | "vendor" | "contract") => {
    if (inFlight.current || busy || !editable || restricted || conflict) return;
    inFlight.current = true; mutation.mutate(action);
  };
  const errors = [catalog.error, plans.error, mutation.error, reload.error].filter(Boolean);
  const disabled = !editable || busy || restricted || conflict || !validation.success || clearing || (!current && registeredKinds.includes(draft.kind ?? "")) || !changed || catalog.isPending || catalog.isError || (!!draft.plan && (plans.isFetching || plans.isError));
  return <DetailDrawer open={open} onClose={() => { if (!busy) onClose(); }} onAfterClose={onAfterClose}
    title={current ? `${current.displayName} 계약 설정` : "벤더 추가"} subtitle={plan?.displayName ?? "플랜 미선택"}
    footer={<div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2"><span className="text-xs text-text2">{changed ? "입력한 월 계약액" : current ? contractAmountLabel(current.contractStatus) : "월 계약액"}</span><strong className="tnum text-[15px]">{draft.plan && summary.tiers ? usd(summary.spend) : "-"}</strong></div>
      {confirm && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-red bg-red-tint px-3 py-2.5">
        <span className="flex-1 text-xs">{confirm === "contract" ? "계약 정보만 비웁니다. 등록한 제품은 유지됩니다." : "등록한 제품을 삭제합니다. 이전 변경 이력은 보존됩니다."}</span>
        <Button size="sm" disabled={busy} onClick={() => setConfirm(null)}>되돌리기</Button>
        <Button size="sm" loading={mutation.isPending && mutation.variables === confirm} loadingLabel={confirm === "contract" ? "비우는 중…" : "삭제 중…"} disabled={busy || conflict || restricted} onClick={() => submit(confirm)}>{confirm === "contract" ? "계약 비우기 확인" : "제품 삭제 확인"}</Button>
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        {current && <Button disabled={!editable || busy || conflict || restricted} onClick={() => setConfirm("vendor")} className="text-red">벤더 삭제</Button>}
        {current?.contract && <Button disabled={!editable || busy || conflict || restricted} onClick={() => setConfirm("contract")}>계약 비우기</Button>}
        <div className="flex-1" /><Button disabled={busy} onClick={onClose}>취소</Button>
        <Button variant="primary" loading={mutation.isPending && mutation.variables === "save"} loadingLabel="저장 중…" disabled={disabled} onClick={() => submit("save")}>{current ? "변경사항 저장" : "벤더 추가"}</Button>
      </div>
    </div>}>
    <div className="flex flex-col gap-6">
      {current && <div className="flex flex-col gap-2">
        <ContractStatusBadge status={current.contractStatus} />
        {current.contract && <p className="text-xs text-text3">계약 기간 {current.contract.effectiveFrom} ~ {current.contract.effectiveTo ?? "종료일 미지정"}</p>}
        {current.contractStatus === "expired" && <p className="text-xs text-text3">마지막 계약 정보입니다. 갱신 여부를 확인해 주세요.</p>}
      </div>}
      {errors.length > 0 && <ErrorState message={<>{errors.map((error, index) => <p key={index}>{error!.message}</p>)}</>}>
        {conflict ? <Button size="sm" loading={reload.isPending} loadingLabel="불러오는 중…" disabled={busy} onClick={() => reload.mutate()}>입력 취소 후 최신 내용 불러오기</Button> : (catalog.isError || plans.isError) && <Button size="sm" onClick={() => { void catalog.refetch(); if (draft.kind) void plans.refetch(); }}>다시 조회</Button>}
      </ErrorState>}
      {!restricted && <>
        <fieldset disabled={!editable || busy || conflict} className="min-w-0">
          <ContractForm row={row} isNew={!current} draft={draft} existingContract={current?.contract ?? undefined}
            catalog={{ vendors: options, plans: plans.data?.plans ?? [], loading: plans.isFetching }}
            onChange={patch => { setDraft(previous => ({ ...previous, ...patch })); mutation.reset(); setConfirm(null); }} />
        </fieldset>
        {clearing && <p role="alert" className="text-xs text-red">기존 계약을 없애려면 하단의 계약 비우기를 사용하세요.</p>}
        {!validation.success && draft.kind && <ul className="text-xs text-red">{[...new Set(validation.error.issues.map(issue => issue.message))].map(message => <li key={message}>{message}</li>)}</ul>}
        {current && <section className="flex flex-col gap-2 rounded-md border border-border bg-sub p-3">
          <span className="text-xs font-semibold">신호에서 측정</span>
          {[{ label: "활성 사용자 (7일)", value: current.activeUsers7d }, { label: "30일 누적 사용자", value: current.activeUsers30d }].map(fact => <div key={fact.label} className="flex justify-between text-xs"><span className="text-text3">{fact.label}</span><span>{fact.value == null ? "-" : `${int(fact.value)}명`}</span></div>)}
          <div className="flex justify-between text-xs"><span className="text-text3">배정 좌석(좌석 원장)</span>
            <span>{!current.seats?.data ? "-" : `${int(current.seats.data.assigned)}석${current.seats.data.contracted === null ? "" : ` / 계약 ${int(current.seats.data.contracted)}석`}`}</span></div>
        </section>}
      </>}
    </div>
  </DetailDrawer>;
}
