"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import type { OverviewModel } from "@/lib/metrics/overview";

/**
 * 신호가 한 번도 들어온 적 없는 조직.
 * KPI 를 0 으로 채우지 않고 설치 안내로 통째로 대체합니다 —
 * 0 은 "안 썼다"는 뜻이지 "아직 모른다"는 뜻이 아니기 때문입니다.
 */
export function OverviewEmptyState({ model }: { model: OverviewModel }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(model.installCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 권한이 없으면 사용자가 직접 선택해 복사합니다 */
    }
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-5 rounded-lg border border-border bg-card p-[22px]">
      <div className="flex flex-col gap-[5px]">
        <span className="text-[15px] font-semibold">
          아직 수집된 신호가 없습니다
        </span>
        <span className="pretty text-[12.5px] text-text2">
          데몬을 설치한 시점부터 사용량이 쌓입니다 · 설치 이전 기간은 조회할 수
          없습니다
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        {model.setupSteps.map((st) => (
          <div
            key={st.n}
            className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-3"
          >
            <span
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: st.badgeBg, color: st.badgeFg }}
            >
              {st.n}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12.5px] font-semibold">{st.title}</span>
              <span className="pretty text-[11.5px] text-text2">
                {st.note}
              </span>
            </div>
            <span
              className="text-[11.5px] font-semibold whitespace-nowrap"
              style={{ color: st.stateFg }}
            >
              {st.state}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-[7px]">
        <span className="text-[11.5px] text-text3">
          설치 명령 · 관리자 권한으로 한 대에서 먼저 확인하세요
        </span>
        <div className="flex items-center gap-2 rounded-md border border-border bg-sub px-3 py-[11px]">
          <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[11.5px] whitespace-nowrap text-text">
            {model.installCmd}
          </code>
          <Button size="sm" onClick={copy}>
            {copied ? "복사됨" : "복사"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
        <span
          aria-hidden="true"
          className="h-[13px] w-[13px] shrink-0 rounded-full border-2 border-text3 border-t-transparent"
          style={{ animation: "spin .8s linear infinite" }}
        />
        <span className="pretty min-w-0 flex-1 text-[12px] text-text2">
          첫 신호를 기다리는 중 · 설치 후 최대 5분 내에 이 화면이 대시보드로
          바뀝니다
        </span>
        <ButtonLink
          href="/settings#vendors"
          variant="primary"
          className="h-8 px-[13px]"
        >
          계약 정보 먼저 입력
        </ButtonLink>
      </div>
    </div>
  );
}
