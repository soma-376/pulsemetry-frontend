"use client";

import { useMemo, useState } from "react";
import { CoverageBar } from "@/components/layout/CoverageBar";
import { FilterToolbar } from "@/components/layout/FilterToolbar";
import { IngestDownBanner } from "@/components/layout/IngestDownBanner";
import { InviteModal } from "@/components/members/InviteModal";
import { MemberListCard } from "@/components/members/MemberListCard";
import { SeatReclaimCard } from "@/components/members/SeatReclaimCard";
import { UnassignedCard } from "@/components/members/UnassignedCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { useFilters } from "@/lib/filters";
import { buildMembers, type MemberState } from "@/lib/metrics/members";

/**
 * P6 구성원.
 *
 * 셸(사이드바·필터 툴바·커버리지 바)과 카드·버튼·셀렉트는 기존 것을 그대로 씁니다.
 * 이 페이지가 새로 가진 것은 좌석 회수·팀 배정·초대 세 가지 동작뿐입니다.
 */
export function MembersContent() {
  const { dates } = useFilters();

  const [state, setState] = useState<MemberState>({ reclaimed: {}, assigned: {} });
  const [reclaimPicks, setReclaimPicks] = useState<Record<string, boolean>>({});
  const [assignPicks, setAssignPicks] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastReclaim, setLastReclaim] = useState<string[]>([]);

  const model = useMemo(() => buildMembers(dates, state), [dates, state]);

  const picked = model.reclaimRows.filter((r) => reclaimPicks[r.account]);
  const preview = model.reclaimPreview(picked.length);

  const applyReclaim = () => {
    const accounts = picked.map((r) => r.account);
    setState((prev) => ({
      ...prev,
      reclaimed: { ...prev.reclaimed, ...Object.fromEntries(accounts.map((a) => [a, true])) },
    }));
    setReclaimPicks({});
    setLastReclaim(accounts);
    setConfirmOpen(false);
  };

  const undoReclaim = () => {
    setState((prev) => {
      const next = { ...prev.reclaimed };
      for (const account of lastReclaim) delete next[account];
      return { ...prev, reclaimed: next };
    });
    setLastReclaim([]);
  };

  const applyAssign = () => {
    const picks = Object.entries(assignPicks).filter(([, team]) => team);
    setState((prev) => ({
      ...prev,
      assigned: { ...prev.assigned, ...Object.fromEntries(picks) },
    }));
    setAssignPicks({});
  };

  return (
    <>
      <FilterToolbar />

      {model.ingest.isDown && (
        <IngestDownBanner
          title={model.ingest.down.title}
          detail={model.ingest.down.detail}
        />
      )}

      <CoverageBar
        dotColor={model.ingest.dot}
        installs={model.ingest.liveInstalls}
        members={model.ingest.liveMembers}
        coverage={model.ingest.liveCoverage}
        ingestText={model.ingest.text}
        ingestColor={model.ingest.fg}
      />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 pt-5 pb-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-[18px] font-semibold tracking-[-0.01em]">구성원</h1>
            <span className="text-[12px] text-text3">{model.pageSub}</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-text3">{model.seatStatus}</span>
            <Button variant="primary" className="px-3.5" onClick={() => setInviteOpen(true)}>
              구성원 초대
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 @max-[1180px]:grid-cols-2 @max-[620px]:grid-cols-1">
          {model.seatCards.map((c) => (
            <StatCard
              key={c.label}
              label={c.label}
              value={c.value}
              unit={c.unit}
              caption={c.caption}
              tone={c.tone}
            />
          ))}

          <SeatReclaimCard
            model={model}
            picked={reclaimPicks}
            onToggle={(account) =>
              setReclaimPicks((prev) => ({ ...prev, [account]: !prev[account] }))
            }
            onConfirm={() => setConfirmOpen(true)}
            undoCount={lastReclaim.length}
            onUndo={undoReclaim}
          />

          <UnassignedCard
            model={model}
            picks={assignPicks}
            onPick={(account, team) =>
              setAssignPicks((prev) => ({ ...prev, [account]: team }))
            }
            onApply={applyAssign}
          />

          <MemberListCard model={model} />
        </div>
      </div>

      <Modal
        open={confirmOpen && picked.length > 0}
        onClose={() => setConfirmOpen(false)}
        title={preview.title}
        width={460}
        footer={
          <>
            <div className="flex-1" />
            <Button onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button variant="primary" onClick={applyReclaim}>
              {picked.length}석 회수
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col border-t border-border">
            {picked.map((r) => (
              <div
                key={r.account}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 text-[12px]"
              >
                <span className="min-w-0 flex-1 basis-40 overflow-hidden text-ellipsis whitespace-nowrap">
                  {r.account}
                </span>
                <span className="text-text3">{r.team}</span>
                <span className="tnum text-text3">{r.idleText}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded-md bg-sub px-3 py-2.5">
            <span className="tnum text-[12px] font-semibold">{preview.seatText}</span>
            <span className="pretty text-[11.5px] text-text2">
              계정은 조회 전용으로 전환되고 사용 기록은 유지됩니다 · 다시 초대하면
              좌석을 재배정할 수 있습니다
            </span>
          </div>
        </div>
      </Modal>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        seatStatus={model.seatStatus}
      />
    </>
  );
}
