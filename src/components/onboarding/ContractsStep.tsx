"use client";

import { useState } from "react";
import { ContractForm } from "@/components/settings/ContractForm";
import { Button } from "@/components/ui/Button";
import { useOrganization } from "@/lib/organization-store";
import { createManualContract, NEW_CONTRACT_ROW } from "@/lib/contracts";
import { contractSchema } from "@/lib/schemas/contract";
import { EMPTY_TIER } from "@/lib/settings";

export function ContractsStep() {
  const { state, update } = useOrganization();
  const [message, setMessage] = useState("");
  const draft = state.onboardingDraft.contract;
  const validation = contractSchema().safeParse(draft);
  return <div className="flex flex-col gap-6">
    <p className="text-sm leading-6 text-text2">사용 중인 개발 도구의 계약을 하나 이상 등록하세요. 좌석 수와 단가는 계약서를 기준으로 입력합니다.</p>
    {state.addedVendors.length > 0 && <section aria-label="등록한 계약" className="rounded-lg border border-border bg-sub px-4">
      <ul className="divide-y divide-border">{state.addedVendors.map((vendor) => <li key={vendor.id} className="flex items-center gap-3 py-3">
        <span className="min-w-0 flex-1 break-words text-sm">{vendor.short}<span className="ml-2 text-xs text-text3">등록됨</span></span>
        <Button size="sm" aria-label={`${vendor.short} 계약 삭제`} onClick={() => update((previous) => ({ ...previous, addedVendors: previous.addedVendors.filter((item) => item.id !== vendor.id) }))}>삭제</Button>
      </li>)}</ul>
    </section>}
    <form noValidate onSubmit={(event) => {
      event.preventDefault();
      if (!validation.success) return;
      const vendor = createManualContract(draft, `manual_${crypto.randomUUID()}`);
      update((previous) => ({ ...previous, addedVendors: [...previous.addedVendors, vendor], onboardingDraft: { ...previous.onboardingDraft, contract: { kind: "copilot", plan: "seat_flat", tiers: [{ ...EMPTY_TIER }], term: "" } } }));
      setMessage(`${vendor.short} 계약을 등록했습니다`);
    }} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 @container">
      <ContractForm row={NEW_CONTRACT_ROW} isNew draft={draft} onChange={(patch) => {
        setMessage("");
        update((previous) => ({ ...previous, onboardingDraft: { ...previous.onboardingDraft, contract: { ...previous.onboardingDraft.contract, ...patch } } }));
      }} />
      {draft.kind === "other" && !draft.name?.trim() && <p className="text-xs text-red">벤더 표시 이름을 입력하세요</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-xs text-text2">{message}</p><Button type="submit" variant="primary" disabled={!validation.success}>계약 등록</Button></div>
    </form>
    <p className="text-xs text-text3">계약을 등록한 뒤 다음 단계로 이동하세요. 추가 계약은 설정에서도 등록할 수 있습니다.</p>
  </div>;
}
