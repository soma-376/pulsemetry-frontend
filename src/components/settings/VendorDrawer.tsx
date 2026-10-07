"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ContractForm } from "./ContractForm";
import { contractSchema } from "@/lib/schemas/contract";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { int, usd } from "@/lib/format";
import {
  ADD_KINDS,
  contractCheck,
  EMPTY_TIER,
  getVendorPlans,
  tierSpend,
  toDraftTiers,
  validateTiers,
  type DraftTier,
  type VendorDraft,
  type VendorRow,
} from "@/lib/settings";

/**
 * 계약 설정 드로어.
 *
 * 초안(draft)에만 쓰고 저장할 때만 반영합니다 — 취소가 실제로 취소가 되도록.
 * 하단에 "월 계약액"을 전후 비교로 보여주는 이유는, 이 입력 하나가
 * 조직 전체 지출과 좌석 효율을 바꾸기 때문입니다.
 */
export function VendorDrawer({
  open,
  row,
  isNew,
  draft,
  onChange,
  onClose,
  onAfterClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  row: VendorRow | null;
  isNew: boolean;
  draft: VendorDraft;
  onChange: (patch: VendorDraft) => void;
  onClose: () => void;
  onAfterClose: () => void;
  onSave: (tiers: DraftTier[], plan: string | null, name: string) => void;
  onDelete: () => void;
}) {
  const [askDelete, setAskDelete] = useState(false);


  if (!row) return null;

  const kind = isNew ? draft.kind ?? "copilot" : row.kind;
  const plans = getVendorPlans(kind, row.family);
  const plan = draft.plan !== undefined ? draft.plan : row.plan;
  const planDef = plans.find((p) => p.v === plan) ?? null;
  const isSeat = planDef?.bill === "seat";
  const isMetered = planDef?.bill === "metered";

  const tiers = draft.tiers?.length ? draft.tiers : [EMPTY_TIER];
  const validation = validateTiers(tiers);
  const seats = validation.seats;
  const seatSpend = validation.spend;
  const stdFee = validation.tiers?.[0]?.fee ?? 0;
  const setUp = !!planDef && (!isSeat || validation.tiers !== null);

  const baseTiers = toDraftTiers(row.contract);
  const baseSpend = tierSpend(baseTiers);
  const term = draft.term ?? row.contract.term ?? "";

  const name = draft.name ?? (isNew ? "" : row.short);
  const kindLabel =
    ADD_KINDS.find((k) => k.v === (draft.kind ?? "copilot"))?.label ?? ADD_KINDS[0].label;
  const shownName = name.trim() || (isNew ? kindLabel : row.short);

  const changed =
    JSON.stringify({ p: row.plan, t: baseTiers, m: row.contract.term ?? "", n: row.short, pn: row.contract.planName ?? "" }) !==
    JSON.stringify({ p: plan, t: tiers, m: term, n: shownName, pn: draft.planName?.trim() ?? row.contract.planName ?? "" });

  const check = contractCheck({
    isSeat: !!isSeat,
    isMetered: !!isMetered,
    setUp,
    noSignal: row.noSignal,
    users: row.users,
    distinct30: row.distinct30,
    seats,
    stdFee,
  });

  const idle = seats > 0 ? Math.max(0, seats - row.users) : null;
  const facts = [
    { k: "활성 사용자 (7일)", v: row.noSignal ? "신호 없음" : `${int(row.users)}명`, muted: row.noSignal },
    { k: "30일 누적 사용자", v: row.noSignal ? "신호 없음" : `${int(row.distinct30)}명`, muted: row.noSignal },
    ...(isSeat
      ? [
          {
            k: "미사용 좌석",
            v:
              idle == null
                ? "좌석 수 미입력"
                : row.noSignal
                  ? "측정 없음"
                  : `${int(idle)}석 · ${usd(idle * stdFee)}/월`,
            muted: idle == null || row.noSignal,
          },
        ]
      : []),
  ];

  const saveDisabled = !setUp || !contractSchema(row.family).safeParse({ ...draft, kind, plan, tiers }).success || (!isNew && !changed);
  const deleteDisabled = isNew || (!row.manual && !row.plan && baseTiers.length === 0);
  const dirty = !!isSeat && setUp && Math.abs(seatSpend - baseSpend) > 0.005 && baseSpend > 0;

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      onAfterClose={onAfterClose}
      title={isNew ? "벤더 추가" : `${shownName} 계약 설정`}
      subtitle={planDef ? (kind === "other" && draft.planName?.trim() ? draft.planName.trim() : planDef.label) : "플랜 미선택"}
      footer={
        <div className="flex flex-col gap-3">
          {/* 저장 전후를 나란히 보여줍니다 — 숫자가 바뀌는 걸 모르고 저장하지 않도록 */}
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[11.5px] text-text2">
                {isSeat ? "월 계약액" : isMetered ? "실측 월 비용" : "월 비용"}
              </span>
              <span className="tnum flex items-baseline gap-1.5">
                {dirty && (
                  <>
                    <span className="text-[12px] text-text3 line-through">
                      {usd(baseSpend)}
                    </span>
                    <span className="text-[12px] text-text3">→</span>
                  </>
                )}
                <span className="text-[15px] font-semibold text-text">
                  {!planDef ? "미입력" : isSeat ? (setUp ? usd(seatSpend) : "미입력") : usd(row.metered)}
                </span>
                {planDef && !(isSeat && !setUp) && (
                  <span className="text-[11px] text-text3">/ 월</span>
                )}
                {dirty && (
                  <span
                    className="text-[12px] font-semibold"
                    style={{
                      color: seatSpend > baseSpend ? "var(--orange-ink)" : "var(--green)",
                    }}
                  >
                    {seatSpend >= baseSpend ? "+" : "−"}
                    {usd(Math.abs(seatSpend - baseSpend))}
                  </span>
                )}
              </span>
            </div>
            <span className="pretty text-[11px] text-text3">
              {!setUp
                ? isNew
                  ? "플랜과 좌석 정보를 입력하면 목록에 추가됩니다"
                  : "단가와 좌석 수를 입력해야 합계에 들어갑니다"
                : changed
                  ? "저장하기 전까지 조직 합계는 바뀌지 않습니다"
                  : `${row.contract.reviewedAt ?? ""} ${row.contract.reviewer ?? ""} 확인`}
            </span>
          </div>

          {askDelete && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-red bg-red-tint px-3 py-2.5">
              <span className="pretty min-w-0 flex-1 basis-50 text-[11.5px] text-text2">
                {row.manual
                  ? "이 벤더를 목록에서 지웁니다 · 수동 추가한 벤더라 신호가 없어 복구되지 않습니다"
                  : "계약 정보만 지웁니다 · 신호는 계속 들어오므로 행은 감지됨 · 미설정으로 돌아갑니다"}
              </span>
              <Button size="sm" onClick={() => setAskDelete(false)}>
                되돌리기
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setAskDelete(false);
                  onDelete();
                }}
              >
                {row.manual ? "삭제" : "계약 비우기"}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={deleteDisabled}
              onClick={() => setAskDelete(true)}
              className={deleteDisabled ? "" : "text-red"}
            >
              {isNew ? "삭제" : row.manual ? "벤더 삭제" : "계약 삭제"}
            </Button>
            <div className="flex-1" />
            <Button onClick={onClose}>취소</Button>
            <Button
              variant="primary"
              disabled={saveDisabled}
              onClick={() => onSave(tiers, plan ?? null, shownName)}
            >
              {isNew ? "벤더 추가" : changed ? "변경사항 저장" : "변경사항 없음"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <ContractForm row={row} isNew={isNew} draft={draft} onChange={onChange} />

        <section className="flex flex-col gap-2 rounded-md border border-border bg-sub p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold">신호에서 측정</span>
            <span
              className="rounded-[3px] px-1 text-[10px] leading-[15px] font-semibold"
              style={{
                background: row.noSignal ? "var(--gray-tint)" : "var(--green-tint)",
                color: row.noSignal ? "var(--text2)" : "var(--green)",
              }}
            >
              {row.noSignal ? "신호 없음" : "측정"}
            </span>
          </div>

          {facts.map((f) => (
            <div key={f.k} className="flex items-baseline justify-between gap-3">
              <span className="text-[11.5px] text-text3">{f.k}</span>
              <span
                className="tnum text-[12px]"
                style={{ color: f.muted ? "var(--text3)" : "var(--text)" }}
              >
                {f.v}
              </span>
            </div>
          ))}

          {check && (
            <p
              className="pretty border-t border-border pt-2 text-[11.5px]"
              style={{ color: check.fg }}
            >
              {check.note}
            </p>
          )}
        </section>
      </div>
    </DetailDrawer>
  );
}
