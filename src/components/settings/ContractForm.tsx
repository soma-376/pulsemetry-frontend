"use client";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateInput } from "@/components/ui/DateInput";
import { currentDateIso } from "@/lib/date";
import { Select } from "@/components/ui/Select";
import { int, usd } from "@/lib/format";
import { ADD_KINDS, EMPTY_TIER, MAX_TIERS, PLAN_SETS, validateTiers, type DraftTier, type VendorDraft, type VendorRow } from "@/lib/settings";
const TIER_COLS =
  "grid grid-cols-[minmax(0,1fr)_64px_78px_74px_28px] items-center gap-1.5 " +
  "@max-[420px]:grid-cols-[minmax(0,1fr)_56px_66px_24px] @max-[420px]:[&>*:nth-child(4)]:hidden";


export function ContractForm({ row, isNew, draft, onChange }: { row: VendorRow; isNew: boolean; draft: VendorDraft; onChange: (patch: VendorDraft) => void }) {
  const validationId = useId();
  const plans = PLAN_SETS[row.family];
  const plan = draft.plan !== undefined ? draft.plan : row.plan;
  const planDef = plans.find((p) => p.v === plan) ?? null;
  const isSeat = planDef?.bill === "seat";
  const tiers = draft.tiers?.length ? draft.tiers : [EMPTY_TIER];
  const validation = validateTiers(tiers);
  const seats = validation.seats;
  const seatSpend = validation.spend;
  const term = draft.term ?? row.contract.term ?? "";
  const name = draft.name ?? (isNew ? "" : row.short);
  const kindLabel = ADD_KINDS.find((k) => k.v === (draft.kind ?? "copilot"))?.label ?? ADD_KINDS[0].label;
  const setTiers = (next: DraftTier[]) => onChange({ tiers: next });
  const patchTier = (index: number, patch: Partial<DraftTier>) => setTiers(tiers.map((t, i) => i === index ? { ...t, ...patch } : t));
  return <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2.5">
          <span className="text-[12px] font-semibold">계약 기본정보</span>

          <label className="flex flex-col gap-1 text-[11.5px] text-text2">
            표시 이름
            <Input
              value={name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={isNew ? kindLabel : row.short}
              maxLength={100}
              aria-label="표시 이름"
            />
          </label>

          {isNew && (
            <label className="flex flex-col gap-1 text-[11.5px] text-text2">
              벤더
              <Select
                value={draft.kind ?? "copilot"}
                onChange={(e) => onChange({ kind: e.target.value })}
                aria-label="벤더"
              >
                {ADD_KINDS.map((k) => (
                  <option key={k.v} value={k.v}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-2 @max-[700px]:grid-cols-1">
            <label className="flex flex-col gap-1 text-[11.5px] text-text2">
              플랜
              <Select
                value={plan ?? ""}
                onChange={(e) => onChange({ plan: e.target.value || null })}
                aria-label="플랜"
              >
                {!planDef && <option value="">선택하세요</option>}
                {plans.map((p) => (
                  <option key={p.v} value={p.v}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </label>
            <DateInput label="계약 종료일" value={term} min={currentDateIso()} onChange={(value) => onChange({ term: value })} />
          </div>

          <span
            className="pretty text-[11px]"
            style={{ color: planDef ? "var(--text2)" : "var(--orange-ink)" }}
          >
            {planDef ? planDef.note : "신호로는 알 수 없는 계약 정보입니다 · 계약서를 보고 고르세요"}
          </span>
          <span className="text-[11px] text-text3">
            다음 계약 검토일 {row.contract.nextReview ?? "미정"} · 종료 60일 전 알림
          </span>
        </section>

        {isSeat && (
          <section className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold">계약 좌석 구성</span>
            <span className="pretty text-[11px] text-text3">
              종류마다 단가가 다릅니다 · 평균으로 뭉개면 지출이 틀어집니다
            </span>

            <div className={`${TIER_COLS} px-0.5 pt-1.5 text-[11px] text-text3`}>
              <span>좌석 유형</span>
              <span className="text-right">좌석 수</span>
              <span className="text-right">월 단가</span>
              <span className="text-right">소계</span>
              <span />
            </div>

            {tiers.map((t, i) => {
              const error = t.seats || t.fee ? validation.errors[i] : {};
              const rowValidation = validateTiers([t]);
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className={TIER_COLS}>
                    <Input
                      value={t.label}
                      onChange={(e) => patchTier(i, { label: e.target.value })}
                      aria-label="좌석 유형"
                    />
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
                      {rowValidation.tiers ? usd(rowValidation.spend) : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTiers(tiers.filter((_, k) => k !== i))}
                      disabled={tiers.length <= 1}
                      aria-label="좌석 유형 삭제"
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
              <Button
                size="sm"
                disabled={tiers.length >= MAX_TIERS}
                onClick={() => setTiers([...tiers, { label: "프리미엄", seats: "", fee: "" }])}
              >
                + 좌석 유형 추가
              </Button>
              <span className="tnum text-[11.5px] text-text2">
                {validation.tiers ? `${int(seats)}석 · ${usd(seatSpend)} / 월` : "좌석 수와 단가를 입력하세요"}
              </span>
            </div>
          </section>
        )}


  </div>;
}
