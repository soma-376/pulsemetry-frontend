"use client";

import { useCallback, useMemo, useState } from "react";
import { CoverageBar } from "@/components/layout/CoverageBar";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { SettingRow, SettingSection } from "@/components/settings/SettingRow";
import { VendorDrawer } from "@/components/settings/VendorDrawer";
import { VendorTable } from "@/components/settings/VendorTable";
import { NEW_CONTRACT_ROW, createManualContract } from "@/lib/contracts";
import { contractSchema } from "@/lib/schemas/contract";
import { PromptCollectionField } from "./PromptCollectionField";
import { useOrganization } from "@/lib/organization-store";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { Toggle } from "@/components/ui/Toggle";
import { ingestBadge } from "@/lib/metrics/observation";
import {
  ADMIN_EMAIL,
  ALERT_RULES,
  buildVendorRows,
  EMPTY_TIER,
  KEEP_NOTES,
  KEEP_ORDER,
  NEW_VENDOR_ID,
  PLAN_SETS,
  policyCopy,
  RECLAIM_BY_IDLE,
  STALE_INSTALLS,
  TODAY,
  toDraftTiers,
  validateTiers,
  vendorSummary,
  type DraftTier,
  type PolicyAsk,
  type VendorDraft,
  type VendorEdits,
  type VendorRow,
} from "@/lib/settings";
import { COVERAGE, INGEST } from "@/mocks/overview";
import type { VendorRecord } from "@/mocks/vendors";

/**
 * P5 설정.
 *
 * 다른 화면이 "무슨 일이 있었나"를 보여준다면 여기는 "무엇을 사실로 둘 것인가"를 정합니다.
 * 그래서 되돌릴 수 없는 변경(프롬프트 원문 수집, 보존 기간 단축, 계약 삭제)에만
 * 확인 단계를 두고, 나머지는 즉시 적용합니다.
 */
export function SettingsContent() {
  const { state: organization, update } = useOrganization();
  const edits = organization.vendorEdits;
  const added = organization.addedVendors;
  const setEdits = (change: (previous: VendorEdits) => VendorEdits) => update((previous) => {
    const vendorEdits = change(previous.vendorEdits);
    return { ...previous, vendorEdits };
  });
  const setAdded = (change: (previous: VendorRecord[]) => VendorRecord[]) => update((previous) => {
    const addedVendors = change(previous.addedVendors);
    return { ...previous, addedVendors };
  });
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState<VendorRow | null>(null);
  const [draft, setDraft] = useState<VendorDraft>({});

  const promptRaw = organization.promptRaw ?? false;
  const setPromptRaw = (value: boolean) => update((previous) => ({ ...previous, promptRaw: value }));
  const [idleDays, setIdleDays] = useState("14");
  const [keepMonths, setKeepMonths] = useState("24");
  const [rules, setRules] = useState<Record<string, boolean>>({});
  const [ask, setAsk] = useState<PolicyAsk | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [installSent, setInstallSent] = useState(false);

  const rows = useMemo(() => buildVendorRows(edits, added), [edits, added]);
  const summary = useMemo(() => vendorSummary(rows), [rows]);
  const ingest = ingestBadge(INGEST);

  const isNew = drawerId === NEW_VENDOR_ID;

  const openVendor = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setDrawerId(id);
    setDrawerRow(row);
    setDrawerOpen(true);
    setDraft({
      plan: row.plan,
      tiers: toDraftTiers(row.contract),
      term: row.contract.term ?? "",
      name: row.short,
    });
  };

  const openNew = () => {
    setDrawerId(NEW_VENDOR_ID);
    setDrawerOpen(true);
    setDrawerRow(NEW_CONTRACT_ROW);
    setDraft({ kind: "copilot", plan: "seat_flat", tiers: [EMPTY_TIER], term: "" });
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  const clearDrawer = useCallback(() => {
    setDrawerId(null);
    setDrawerRow(null);
    setDraft({});
  }, []);

  const saveVendor = (tiers: DraftTier[], plan: string | null, name: string) => {
    if (!contractSchema(drawerRow?.family).safeParse({ ...draft, tiers, plan, name }).success) return;
    const planDef = PLAN_SETS[drawerRow?.family ?? "generic"].find((item) => item.v === plan);
    if (!planDef) return;
    const committedTiers = planDef.bill === "seat" ? validateTiers(tiers).tiers : [];
    if (!committedTiers) return;
    const contract = {
      plan,
      tiers: committedTiers,
      term: draft.term ?? "",
      confirmed: true,
      reviewedAt: TODAY,
      reviewer: ADMIN_EMAIL,
      name,
    };

    if (isNew) {
      const id = `manual_${crypto.randomUUID()}`;
      const vendor = createManualContract({ ...draft, tiers, plan, name }, id);
      setAdded((prev) => [...prev, vendor]);
    } else if (drawerId) {
      setEdits((prev) => ({ ...prev, [drawerId]: { ...prev[drawerId], ...contract } }));
    }
    closeDrawer();
  };

  const deleteVendor = () => {
    if (!drawerId) return;
    if (drawerRow?.manual) {
      setAdded((prev) => prev.filter((v) => v.id !== drawerId));
      setEdits((prev) => ({ ...prev, [drawerId]: undefined }));
    } else {
      // 감지된 벤더는 신호가 계속 들어오므로 행을 지울 수 없습니다 — 계약만 비웁니다
      setEdits((prev) => ({
        ...prev,
        [drawerId]: { cleared: true, plan: null, tiers: [], term: "", confirmed: false, metered: 0 },
      }));
    }
    closeDrawer();
  };

  const copy = ask ? policyCopy(ask, keepMonths) : null;

  const applyPolicy = () => {
    if (!ask) return;
    if (ask.kind === "prompt") setPromptRaw(ask.value);
    else setKeepMonths(ask.value);
    setAsk(null);
  };

  return (
    <>
      <FilterToolbar />

      <CoverageBar
        dotColor={ingest.dot}
        installs={String(COVERAGE.activeInstalls)}
        members={String(COVERAGE.activeMembers)}
        coverage={COVERAGE.coverageText}
        ingestText={ingest.text}
        ingestColor={ingest.fg}
      />

      <div className="mx-auto flex w-full max-w-[1128px] flex-col gap-8 px-6 pt-5 pb-10">
        <h1 className="text-[18px] font-semibold tracking-[-0.01em]">설정</h1>

        <SettingSection id="vendors" title="벤더 연동">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
            {summary.map((s) => (
              <StatCard
                key={s.label}
                label={s.label}
                value={s.value}
                caption={s.note}
                tone={s.tone}
                badge={s.badge}
                size="sm"
              />
            ))}
          </div>
          <VendorTable rows={rows} onOpen={openVendor} onAdd={openNew} />
        </SettingSection>

        <SettingSection id="collection" title="수집 정책">
          <div className="rounded-lg border border-border bg-card">
            <SettingRow
              first
              title="수집 정책 버전"
              note="구버전 설치 4대는 일부 항목이 비어 있습니다 · 각 설치에서 업데이트를 확인해 주세요"
            >
              <div className="flex items-center gap-2">
                <span className="tnum text-[12.5px] font-medium">v1</span>
                <Button size="sm" onClick={() => setInstallOpen(true)}>
                  105 / 109대
                  <span className="rounded bg-orange-ink/15 px-1 text-[11px] text-orange-ink">
                    미적용 4
                  </span>
                </Button>
              </div>
            </SettingRow>

            <SettingRow
              title="프롬프트 원문 수집"
              badge={
                <span
                  className="rounded-[3px] px-1 text-[10px] leading-[15px] font-semibold"
                  style={{
                    background: promptRaw ? "var(--red-tint)" : "var(--sub)",
                    color: promptRaw ? "var(--red)" : "var(--text2)",
                  }}
                >
                  {promptRaw ? "수집함" : "수집 안 함"}
                </span>
              }
              noteColor={promptRaw ? "var(--red)" : "var(--text2)"}
              note={
                promptRaw
                  ? "프롬프트와 응답 본문이 저장됩니다 · 운영·보안의 세션 조회에서 원문을 볼 수 있지만, 코드·고객 정보·자격증명이 함께 들어옵니다"
                  : "본문은 저장하지 않고 길이와 토큰 수만 집계합니다 · 도구 인수, 파일 경로, 오류 메시지 본문도 보내지 않습니다"
              }
            >
              <PromptCollectionField compact value={promptRaw} onChange={(value) => setAsk({ kind: "prompt", value })} />
            </SettingRow>

            <SettingRow
              title="좌석 회수 기준"
              note={`이 기간 신호가 없는 좌석을 회수 후보로 올립니다 · 전 벤더 공통 · 현재 기준 ${RECLAIM_BY_IDLE[idleDays] ?? 0}석`}
            >
              <Select
                value={idleDays}
                onChange={(e) => setIdleDays(e.target.value)}
                aria-label="좌석 회수 기준"
              >
                <option value="7">7일</option>
                <option value="14">14일</option>
                <option value="30">30일</option>
                <option value="60">60일</option>
              </Select>
            </SettingRow>

            <SettingRow
              title="집계 보존"
              note={`팀·일 단위로 합친 수치 · ${KEEP_NOTES[keepMonths] ?? ""}`}
            >
              <Select
                value={keepMonths}
                onChange={(e) => {
                  const next = e.target.value;
                  // 늘리는 건 아무것도 지우지 않습니다 — 줄일 때만 확인을 받습니다
                  if ((KEEP_ORDER[next] ?? 0) < (KEEP_ORDER[keepMonths] ?? 0)) {
                    setAsk({ kind: "keep", value: next });
                  } else {
                    setKeepMonths(next);
                  }
                }}
                aria-label="집계 보존"
              >
                <option value="12">12개월</option>
                <option value="24">24개월</option>
                <option value="36">36개월</option>
                <option value="none">미적용</option>
              </Select>
            </SettingRow>

            <SettingRow
              title="마지막 수집"
              note="24시간 이상 신호가 끊기면 알림 규칙이 발동합니다"
            >
              <span className="tnum text-[12.5px]">{ingest.lag}</span>
            </SettingRow>
          </div>
        </SettingSection>

        <SettingSection id="alerts" title="알림 규칙">
          <div className="rounded-lg border border-border bg-card">
            {ALERT_RULES.map((r, i) => {
              const on = rules[r.id] !== false;
              return (
                <SettingRow key={r.id} first={i === 0} title={r.title} note={r.desc}>
                  <div className="flex items-center gap-3">
                    <span className="tnum text-[12.5px] font-semibold whitespace-nowrap">
                      {r.threshold}
                    </span>
                    <Toggle
                      on={on}
                      label={r.title}
                      onChange={() => setRules((prev) => ({ ...prev, [r.id]: !on }))}
                    />
                  </div>
                </SettingRow>
              );
            })}
          </div>
        </SettingSection>
      </div>

      {drawerId && (
        <VendorDrawer
          open={drawerOpen}
          row={drawerRow}
          isNew={isNew}
          draft={draft}
          onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
          onClose={closeDrawer}
          onAfterClose={clearDrawer}
          onSave={saveVendor}
          onDelete={deleteVendor}
        />
      )}

      {copy && (
        <Modal
          open={!!ask}
          onClose={() => setAsk(null)}
          title={copy.title}
          width={460}
          footer={
            <>
              <div className="flex-1" />
              <Button onClick={() => setAsk(null)}>취소</Button>
              <Button
                variant="primary"
                onClick={applyPolicy}
                className={copy.danger ? "border-red bg-red" : ""}
              >
                {copy.okLabel}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <span
              className="self-start rounded-[3px] px-1.5 text-[10.5px] leading-[17px] font-semibold"
              style={{ background: copy.badge.bg, color: copy.badge.fg }}
            >
              {copy.badge.text}
            </span>
            <p className="pretty text-[12.5px] text-text2">{copy.body}</p>
            <div className="flex flex-col gap-1.5 rounded-md bg-sub px-3 py-2.5">
              {copy.rows.map((r) => (
                <div key={r.k} className="flex items-baseline justify-between gap-3">
                  <span className="text-[11.5px] text-text3">{r.k}</span>
                  <span className="tnum text-[12px]">{r.v}</span>
                </div>
              ))}
            </div>
            <p className="pretty text-[11px] text-text3">{copy.foot}</p>
          </div>
        </Modal>
      )}

      <Modal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        title="미적용 설치 4대"
        subtitle="수집 정책 v1 미적용"
        width={600}
        footer={
          <>
            {installSent && (
              <span className="text-[11.5px] text-green">
                4대에 업데이트 확인 알림을 보냈습니다
              </span>
            )}
            <div className="flex-1" />
            <Button onClick={() => setInstallOpen(false)}>닫기</Button>
            <Button variant="primary" disabled={installSent} onClick={() => setInstallSent(true)}>
              {installSent ? "알림 보냄" : "업데이트 확인 알림 보내기"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="pretty text-[12px] text-text2">
            이 설치들은 구버전 정책으로 동작해 일부 항목이 비어 있습니다 · 자동
            갱신하지 않으므로 각 설치에서 업데이트를 확인해야 합니다
          </p>

          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border text-[11px] text-text3">
                <th scope="col" className="pb-2 text-left font-medium">installation_id</th>
                <th scope="col" className="pb-2 text-left font-medium">팀</th>
                <th scope="col" className="pb-2 text-left font-medium">버전</th>
                <th scope="col" className="pb-2 text-right font-medium">마지막 신호</th>
              </tr>
            </thead>
            <tbody>
              {STALE_INSTALLS.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="py-2.5">
                    <div className="flex flex-col">
                      <span className="font-mono text-[11.5px]">{r.id}</span>
                      <span className="text-[11px] text-text3">{r.mail}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-text2">{r.team}</td>
                  <td className="tnum py-2.5 text-text2">{r.ver}</td>
                  <td className="tnum py-2.5 text-right text-text3">{r.last}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="pretty text-[11px] text-text3">
            이메일은 도메인만 표시합니다 · 개인을 특정해야 하는 경우는 운영 · 보안의
            세션 조회(사유 필수)로
          </p>
        </div>
      </Modal>
    </>
  );
}
