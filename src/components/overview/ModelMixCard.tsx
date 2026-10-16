"use client";

import { useState } from "react";
import { MetricStatusBadge } from "./KpiCard";
import { Donut } from "@/components/charts/Donut";
import { Widget } from "@/components/ui/Card";
import type { OverviewModel } from "@/lib/metrics/overview";

/** W1.4 모델 구성 — 좌석료가 아니라 사용량의 구성을 봅니다 */
export function ModelMixCard({
  model,
}: {
  model: Pick<OverviewModel, "mix" | "observedTokens"> & {
    defs: Pick<OverviewModel["defs"], "w14">;
    mixStatus?: { label: string; reason: string };
  };
}) {
  const { mix, defs } = model;
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Refreshes can reorder or remove rows without changing the selected period.
  const selectedModel = mix.rows.find((row) => row.id === selected);
  const hoveredModel = mix.rows.find((row) => row.id === hovered);
  const activeModel = hoveredModel ?? selectedModel;
  const activeIndex = activeModel ? mix.rows.indexOf(activeModel) : null;
  const select = (id: string) =>
    setSelected((value) => (value === id ? null : id));

  if (mix.count <= 1) {
    const only = mix.rows[0];
    return (
      <Widget
        id="w14"
        label="모델별 사용 환산액 비중"
        title="모델별 사용 환산액 비중"
        note="선택 기간 기준"
        action={
          model.mixStatus ? (
            <MetricStatusBadge {...model.mixStatus} />
          ) : undefined
        }
        def={defs.w14}
        className="col-span-2 @max-[1023px]:col-span-full"
      >
        {only ? (
          <div className="flex flex-1 flex-col justify-center gap-5 py-5">
            <div className="flex items-center gap-2.5">
              <span
                className="h-3 w-3 shrink-0 rounded"
                style={{ background: only.color }}
              />
              <span className="break-all text-lg font-semibold">
                {only.name}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-text3">사용 환산액</dt>
                <dd className="tnum mt-2 text-xl font-semibold">
                  {only.costText}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text3">관측 토큰</dt>
                <dd className="tnum mt-2 text-xl font-semibold">
                  {model.observedTokens}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="py-8 text-sm text-text3">
            사용이 확인된 모델이 없습니다.
          </p>
        )}
      </Widget>
    );
  }

  return (
    <Widget
      id="w14"
      label="모델별 사용 환산액 비중"
      title="모델별 사용 환산액 비중"
      note="선택 기간 기준"
      action={
        model.mixStatus ? <MetricStatusBadge {...model.mixStatus} /> : undefined
      }
      def={defs.w14}
      className="col-span-2 @max-[1023px]:col-span-full"
    >
      <div className="mb-3.5 min-w-0 [overflow-wrap:anywhere] flex flex-col gap-0.5 rounded-md border border-border bg-sub px-3 py-2.5">
        <span className="text-[12.5px] font-semibold">{mix.headline}</span>
        <span className="pretty text-[11.5px] text-text2">{mix.detail}</span>
      </div>

      <div className="grid grid-cols-[168px_minmax(0,1fr)] items-center gap-5 @max-[720px]:grid-cols-[minmax(0,1fr)]">
        <div className="relative h-[168px] w-[168px] justify-self-center">
          <Donut
            slices={mix.slices}
            activeIndex={activeIndex}
            onHover={(index) =>
              setHovered(index === null ? null : (mix.rows[index]?.id ?? null))
            }
            onSelect={(index) => {
              const row = mix.rows[index];
              if (row) select(row.id);
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-px">
            <span className="tnum text-[20px] font-semibold tracking-[-0.02em]">
              {activeModel?.shareText ?? mix.topShare}
            </span>
            <span className="pretty max-w-[120px] text-center text-[10px] text-text3">
              {activeModel?.name ?? mix.topName}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          {mix.rows.map((m) => (
            <button
              type="button"
              key={m.id}
              title={m.tip}
              aria-pressed={selectedModel?.id === m.id}
              onPointerEnter={() => setHovered(m.id)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(m.id)}
              onBlur={() => setHovered(null)}
              onClick={() => select(m.id)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSelected(null);
                  setHovered(null);
                }
              }}
              className="grid cursor-pointer grid-cols-[10px_minmax(0,1fr)_62px] items-center gap-2.5 rounded-md border-b border-border px-2 py-[7px] text-left transition-colors hover:bg-hover"
              style={{
                background: activeModel?.id === m.id ? "var(--sub)" : undefined,
              }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: m.color }}
              />
              <span className="flex min-w-0 flex-col gap-px">
                <span className="min-w-0 text-[12.5px] font-medium [overflow-wrap:anywhere]">
                  {m.name}
                </span>
                <span className="tnum text-[11px] text-text3">
                  {m.perMText}
                </span>
              </span>
              <span className="tnum text-right text-[14px] font-semibold">
                {m.shareText}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex min-h-5 items-center justify-between gap-2 text-[11px] text-text3">
        <span>
          {!selectedModel
            ? "모델을 클릭하면 선택이 유지됩니다"
            : `${selectedModel.name} 선택됨`}
        </span>
        {selectedModel && (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setHovered(null);
            }}
            className="cursor-pointer whitespace-nowrap text-blue hover:underline"
          >
            선택 해제
          </button>
        )}
      </div>
    </Widget>
  );
}
