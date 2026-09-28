"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ContractForm } from "@/components/settings/ContractForm";
import { Button } from "@/components/ui/Button";
import { NEW_CONTRACT_ROW } from "@/lib/contracts";
import { EMPTY_TIER, type VendorDraft } from "@/lib/settings";
import { catalogOptions, plansOptions } from "@/lib/api/vendor-catalog";
import { apiJson, createCommands, readOptions, managementKey, orgPath, vendorResponseSchema, vendorsOptions, ManagementError } from "@/lib/api/management";
import { serverVendorSchema } from "@/lib/schemas/server-contract";

export function ContractsStep({ organizationId, draft, onChange, onBusy }: { organizationId: string; draft: VendorDraft; onChange: (draft: VendorDraft) => void; onBusy: (busy: boolean) => void }) {
  const client = useQueryClient();
  const [post] = useState(createCommands);
  const [message, setMessage] = useState("");
  const catalog = useQuery(catalogOptions(organizationId));
  const plans = useQuery(plansOptions(organizationId, draft.kind ?? "", catalog.data?.catalogVersion));
  const vendors = useQuery(vendorsOptions(organizationId));
  const selectedVendor = catalog.data?.items.find(v => v.id === draft.kind);
  const validation = serverVendorSchema(selectedVendor, plans.data?.plans ?? []).safeParse(draft);
  const refresh = () => client.invalidateQueries({ queryKey: ["organization", organizationId] });
  const save = useMutation({ retry: readOptions.retry, retryDelay: readOptions.retryDelay,
    mutationFn: (body: z.output<ReturnType<typeof serverVendorSchema>>) => post(organizationId, "/vendors", body, vendorResponseSchema),
    onMutate: () => onBusy(true),
    onSuccess: async ({ vendor }) => {
      onChange({ kind: "", plan: null, tiers: [{ ...EMPTY_TIER }], term: "" });
      setMessage(`${vendor.displayName} 벤더를 등록했습니다`);
      await refresh();
    },
    onError: async (error) => {
      if (error instanceof ManagementError && ["invalid_plan", "invalid_vendor"].includes(error.code)) {
        await client.invalidateQueries({ queryKey: ["vendor-catalog", organizationId] });
        await client.invalidateQueries({ queryKey: ["vendor-plans", organizationId] });
      }
    },
    onSettled: () => onBusy(false),
  });
  const remove = useMutation({ retry: readOptions.retry, retryDelay: readOptions.retryDelay,
    mutationFn: (vendor: { vendorId: string; version: number }) => apiJson("enrollment", orgPath(organizationId, `/vendors/${encodeURIComponent(vendor.vendorId)}`), z.undefined(), { method: "DELETE", headers: { "If-Match": `"vendor-${vendor.version}"` } }),
    onMutate: () => onBusy(true),
    onSuccess: refresh,
    onError: async (error) => { if (error instanceof ManagementError && error.code === "version_conflict") await client.invalidateQueries({ queryKey: managementKey(organizationId, "vendors") }); },
    onSettled: () => onBusy(false),
  });
  const busy = save.isPending || remove.isPending;
  const errors = [catalog.error, plans.error, vendors.error, save.error, remove.error].filter(Boolean);
  return <div className="flex flex-col gap-6">
    <p className="text-sm leading-6 text-text2">사용 중인 개발 도구를 하나 이상 등록하세요. 플랜·좌석 수·단가는 나중에 입력할 수 있습니다.</p>
    {errors.length > 0 && <div role="alert" className="text-xs text-red">{errors.map((error, index) => <p key={index}>{error!.message}</p>)}<Button size="sm" onClick={() => { void catalog.refetch(); if (draft.kind) void plans.refetch(); void vendors.refetch(); }} disabled={busy}>다시 조회</Button></div>}
    {vendors.isPending && <p role="status" className="text-xs text-text3">등록한 벤더를 불러오는 중입니다…</p>}
    {!!vendors.data?.some(v => v.source === "manual") && <section aria-label="등록한 벤더" className="rounded-lg border border-border bg-sub px-4">
      <ul className="divide-y divide-border">{vendors.data.filter(v => v.source === "manual").map(vendor => <li key={vendor.vendorId} className="flex items-center gap-3 py-3">
        <span className="min-w-0 flex-1 break-words text-sm">{vendor.displayName}<span className="ml-2 text-xs text-text3">{vendor.contract ? "계약 등록됨" : "벤더 등록됨"}</span></span>
        <Button size="sm" disabled={busy} aria-label={`${vendor.displayName} 벤더 삭제`} onClick={() => remove.mutate(vendor)}>삭제</Button>
      </li>)}</ul>
    </section>}
    <form noValidate onSubmit={event => { event.preventDefault(); if (validation.success && !busy) save.mutate(validation.data); }} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 @container">
      <fieldset disabled={busy || catalog.isPending || catalog.isError} className="min-w-0">
        <ContractForm row={NEW_CONTRACT_ROW} isNew draft={draft} catalog={{ vendors: catalog.data?.items ?? [], plans: plans.data?.plans ?? [], loading: plans.isFetching }} onChange={patch => { setMessage(""); save.reset(); onChange({ ...draft, ...patch }); }} />
      </fieldset>
      {!validation.success && draft.kind && <ul className="text-xs text-red">{[...new Set(validation.error.issues.map(issue => issue.message))].map(message => <li key={message}>{message}</li>)}</ul>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-xs text-text2">{message}</p><Button type="submit" variant="primary" disabled={!validation.success || busy || catalog.isError || (!!draft.plan && (plans.isError || plans.isFetching))}>{save.isPending ? "등록 중…" : "벤더 등록"}</Button></div>
    </form>
    <p className="text-xs text-text3">벤더를 등록한 뒤 다음 단계로 이동하세요.</p>
  </div>;
}
