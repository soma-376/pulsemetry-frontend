"use client";

import { useQuery } from "@tanstack/react-query";
import { settingsOptions } from "@/lib/api/settings";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

export type VendorOption = { vendorId: string; displayName: string };
export function usePlannedVendors(organizationId: string, enabled: boolean) {
  return useQuery({ ...settingsOptions(organizationId), enabled: !!organizationId && enabled });
}

/** 초대와 구성원 편집에서 공유한다. 사용 예정 제품은 실제 좌석 배정과 다르다. */
export function PlannedVendorPicker({ label = "사용 예정 제품 (선택)", options, value, onChange, disabled = false }: {
  label?: string; options: VendorOption[]; value: string[]; onChange: (value: string[]) => void; disabled?: boolean;
}) {
  const missing = value.filter(id => !options.some(option => option.vendorId === id));
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="mb-2 text-[11.5px] text-text2">{label}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map(option => <label key={option.vendorId} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs has-disabled:cursor-not-allowed">
        <input type="checkbox" checked={value.includes(option.vendorId)} disabled={!value.includes(option.vendorId) && value.length >= 100}
          onChange={event => onChange(event.target.checked ? [...value, option.vendorId] : value.filter(id => id !== option.vendorId))} />
        {option.displayName}
      </label>)}
      {missing.map(id => <label key={id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-text3">
        <input type="checkbox" checked onChange={() => onChange(value.filter(value => value !== id))} />등록 해제된 제품 ({id})
      </label>)}
    </div>
    {!options.length && !missing.length && <p className="text-xs text-text3">등록된 제품이 없습니다. 설정에서 제품을 등록할 수 있습니다.</p>}
  </fieldset>;
}

export function PlannedVendorQueryState({ query }: { query: ReturnType<typeof usePlannedVendors> }) {
  if (query.isError) return <ErrorState variant="inline" message="제품 목록을 불러오지 못했습니다." retrying={query.isFetching} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <LoadingState variant="inline" message="제품을 불러오는 중입니다…" />;
  return null;
}
