"use client";
import { validateServerTiers } from "@/lib/schemas/server-contract";
import type { CatalogVendor, CatalogPlan } from "@/lib/api/vendor-catalog";
import { allowsSeatTiers } from "@/lib/vendor-catalog";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateInput } from "@/components/ui/DateInput";
import { currentDateIso } from "@/lib/date";
import { Select } from "@/components/ui/Select";
import { int, usd } from "@/lib/format";
import { ADD_KINDS, EMPTY_TIER, MAX_TIERS, getVendorPlans, validateTiers, type DraftTier, type VendorDraft, type VendorRow } from "@/lib/settings";
const TIER_COLS =
  "grid grid-cols-[minmax(0,1fr)_64px_78px_74px_28px] items-center gap-1.5 " +
  "@max-[420px]:grid-cols-[minmax(0,1fr)_56px_66px_24px] @max-[420px]:[&>*:nth-child(4)]:hidden";


export function ContractForm({ row, isNew, draft, onChange, catalog }: { catalog?: { vendors: CatalogVendor[]; plans: CatalogPlan[]; loading: boolean }; row: VendorRow; isNew: boolean; draft: VendorDraft; onChange: (patch: VendorDraft) => void }) {
  const validationId = useId();
  const kind = isNew ? draft.kind ?? (catalog ? "" : "copilot") : row.kind;
  const serverVendor = catalog?.vendors.find(v => v.id === kind);
  const kinds = catalog ? catalog.vendors.map(v => ({ v: v.id, label: v.displayName })) : ADD_KINDS;
  const plans = catalog ? catalog.plans.map(p => ({ v: p.id, label: p.displayName, bill: p.billing, note: p.separateUsageBilling ? "좌석 요금 외 사용량 요금은 별도입니다" : "계약서의 좌석 수와 단가를 입력하세요" })) : getVendorPlans(kind, row.family);
  const allowsTiers = catalog ? serverVendor?.allowsSeatTiers === true : allowsSeatTiers(kind);
  const plan = draft.plan !== undefined ? draft.plan : row.plan;
  const planDef = plans.find((p) => p.v === plan) ?? null;
  const isSeat = planDef?.bill === "seat";
  const tiers = draft.tiers?.length ? draft.tiers : [EMPTY_TIER];
  const validation = catalog ? validateServerTiers(tiers, allowsTiers) : validateTiers(tiers);
  const seats = validation.seats;
  const seatSpend = validation.spend;
  const term = draft.term ?? row.contract.term ?? "";
  const name = draft.name ?? (isNew ? "" : row.short);
  const kindLabel = kinds.find((k) => k.v === kind)?.label ?? row.short;
  const setTiers = (next: DraftTier[]) => onChange({ tiers: next });
  const patchTier = (index: number, patch: Partial<DraftTier>) => setTiers(tiers.map((t, i) => i === index ? { ...t, ...patch } : t));
  return <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2.5">
          <span className="text-[12px] font-semibold">계약 기본정보</span>

          <label className="flex flex-col gap-1 text-[11.5px] text-text2">
            제품
            {isNew ? <Select value={kind} onChange={(event) => onChange({ kind: event.target.value, plan: null, name: "", planName: "", tiers: [{ ...EMPTY_TIER }], ...(catalog ? { term: "" } : {}) })} aria-label="제품">
              {catalog && <option value="">제품을 선택하세요</option>}
              {kinds.map((item) => <option key={item.v} value={item.v}>{item.label}</option>)}
            </Select> : <span className="py-1 text-[12px] text-text">{kindLabel}</span>}
          </label>
          {kind === "other" && <label className="flex flex-col gap-1 text-[11.5px] text-text2">
            {catalog ? "계약 메모 (선택)" : "플랜명 (선택)"}
            <Input value={draft.planName ?? row.contract.planName ?? ""} onChange={(event) => onChange({ planName: event.target.value })} maxLength={100} aria-label={catalog ? "계약 메모" : "플랜명"} placeholder={catalog ? "계약서의 플랜명 등 참고 사항" : "계약서의 플랜명"} />
          </label>}

          <div className="grid grid-cols-2 gap-2 @max-[700px]:grid-cols-1">
            <label className="flex flex-col gap-1 text-[11.5px] text-text2">
              {kind === "other" ? "과금 방식" : "플랜"}
              <Select
                value={planDef ? plan ?? "" : ""}
                onChange={(e) => onChange({ plan: e.target.value || null, ...(catalog && !e.target.value ? { tiers: [{ ...EMPTY_TIER }], term: "", planName: "" } : {}) })}
                aria-label={kind === "other" ? "과금 방식" : "플랜"}
                disabled={catalog ? !serverVendor || catalog.loading : false}
              >
                {catalog ? <option value="">{catalog.loading ? "불러오는 중…" : "나중에 입력"}</option> : !planDef && <option value="">선택하세요</option>}
                {plans.map((p) => (
                  <option key={p.v} value={p.v}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </label>
            <DateInput label="계약 종료일" value={term} min={currentDateIso()} onChange={(value) => onChange({ term: value })} />
          </div>

          <label className="flex flex-col gap-1 text-[11.5px] text-text2">
            {kind === "other" ? "제품 이름" : "표시 이름 (선택)"}
            <Input value={name} onChange={(event) => onChange({ name: event.target.value })} placeholder={kindLabel} maxLength={100} aria-label="표시 이름" />
          </label>

          <span
            className="pretty text-[11px]"
            style={{ color: planDef ? "var(--text2)" : "var(--orange-ink)" }}
          >
            {planDef ? planDef.note : "신호로는 알 수 없는 계약 정보입니다 · 계약서를 보고 고르세요"}
          </span>
          <span className="text-[11px] text-text3">
            {catalog ? "계약 시작일은 등록일입니다 · 플랜과 계약 정보는 나중에 입력할 수 있습니다" : <>다음 계약 검토일 {row.contract.nextReview ?? "미정"} · 종료 60일 전 알림</>}
          </span>
        </section>

        {isSeat && (
          <section className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold">{allowsTiers ? "계약 좌석 구성" : "계약 좌석"}</span>


            <div className={`${TIER_COLS} px-0.5 pt-1.5 text-[11px] text-text3`}>
              <span>{allowsTiers ? "좌석 유형" : "플랜"}</span>
              <span className="text-right">좌석 수</span>
              <span className="text-right">월 단가</span>
              <span className="text-right">소계</span>
              <span />
            </div>

            {tiers.map((t, i) => {
              const error = t.seats || t.fee ? validation.errors[i] : {};
              const rowValidation = catalog ? validateServerTiers([t], allowsTiers) : validateTiers([t]);
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className={TIER_COLS}>
                    {allowsTiers ? <Input
                      value={t.label}
                      onChange={(e) => patchTier(i, { label: e.target.value })}
                      aria-label="좌석 유형"
                    /> : <span className="truncate text-xs" title={planDef?.label}>{planDef?.label}</span>}
                    <Input
                      value={t.seats}
                      onChange={(e) => patchTier(i, { seats: e.target.value })}
                      inputMode="numeric"
                      placeholder="0"
                      aria-label="좌석 수"
                      aria-invalid={!!error.seats}
                      aria-describedby={error.seats ? `${validationId}-${i}-seats` : undefined}
                      className="text-right"
                    />
                    <Input
                      value={t.fee}
                      onChange={(e) => patchTier(i, { fee: e.target.value })}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="월 단가"
                      aria-invalid={!!error.fee}
                      aria-describedby={error.fee ? `${validationId}-${i}-fee` : undefined}
                      className="text-right"
                    />
                    <span className="tnum text-right text-[12px] text-text2">
                      {rowValidation.tiers ? usd(rowValidation.spend) : "-"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTiers(tiers.filter((_, k) => k !== i))}
                      disabled={!allowsTiers || tiers.length <= 1}
                      aria-label="좌석 유형 삭제"
                      hidden={!allowsTiers}
                      className="h-7 w-7 cursor-pointer rounded-md border border-border text-text2 hover:bg-hover disabled:cursor-default disabled:text-border"
                    >
                      ×
                    </button>
                  </div>
                  <div aria-live="polite" className="text-[11px] text-red">
                    {error.seats && <p id={`${validationId}-${i}-seats`}>{error.seats}</p>}
                    {error.fee && <p id={`${validationId}-${i}-fee`}>{error.fee}</p>}
                    {error.subtotal && <p>{error.subtotal}</p>}
                  </div>
                </div>
              );
            })}

            {validation.totalError && (
              <p role="alert" className="text-[11px] text-red">{validation.totalError}</p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {allowsTiers && <Button
                size="sm"
                disabled={tiers.length >= MAX_TIERS}
                onClick={() => setTiers([...tiers, { label: "프리미엄", seats: "", fee: "" }])}
              >
                + 좌석 유형 추가
              </Button>}
              <span className="tnum text-[11.5px] text-text2">
                {validation.tiers ? `${int(seats)}석 · ${usd(seatSpend)} / 월` : "좌석 수와 단가를 입력하세요"}
              </span>
            </div>
          </section>
        )}


  </div>;
}
