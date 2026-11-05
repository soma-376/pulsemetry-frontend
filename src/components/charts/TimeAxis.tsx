"use client";

import { useEffect, useRef, useState } from "react";
import { timeAxisLayout } from "@/lib/metrics/time-axis";
import { xAt } from "./scale";

type Measurement = { key: string; width: number; labels: number[] };

/** 라벨만 간추린다. 차트의 실제 시간 위치와 전체 구간 탐색은 바꾸지 않는다. */
export function TimeAxis({
  labels,
  positions,
}: {
  labels: string[];
  positions?: number[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const measureRoot = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const labelKey = JSON.stringify(labels);

  useEffect(() => {
    const axis = root.current;
    const spans = measureRoot.current?.querySelectorAll("span");
    if (!axis || !spans) return;
    const observer = new ResizeObserver(() => {
      const width = axis.getBoundingClientRect().width;
      const measured = Array.from(
        spans,
        (span) => span.getBoundingClientRect().width,
      );
      setMeasurement((previous) =>
        previous?.key === labelKey &&
        previous.width === width &&
        measured.every((value, index) => previous.labels[index] === value)
          ? previous
          : { key: labelKey, width, labels: measured },
      );
    });
    observer.observe(axis);
    // 폰트 로드·테마의 글자 폭 변화도 실제 레이블과 같은 스타일로 관측한다.
    spans.forEach((span) => observer.observe(span));
    return () => observer.disconnect();
  }, [labelKey]);

  const measured =
    measurement?.key === labelKey && measurement.width > 0 ? measurement : null;
  const layout = measured
    ? timeAxisLayout(
        positions ?? labels.map((_, index) => xAt(index, labels.length)),
        measured.labels,
        measured.width,
      )
    : null;
  const endpoints =
    labels.length > 1 ? [0, labels.length - 1] : labels.length ? [0] : [];

  return (
    <div
      ref={root}
      data-testid="trend-time-axis"
      data-ready={measured !== null}
      className="tnum relative min-h-5 text-[11px] leading-4 text-text3"
    >
      <div
        ref={measureRoot}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 h-0 w-0 overflow-hidden"
      >
        {labels.map((label, index) => (
          <span key={index} className="block w-max whitespace-nowrap">
            {label}
          </span>
        ))}
      </div>
      {!layout ? (
        <div className="flex flex-col gap-1">
          {endpoints.map((index) => (
            <span
              key={index}
              data-tick-index={index}
              className="wrap-anywhere"
              style={{
                textAlign:
                  labels.length === 1
                    ? "center"
                    : index === 0
                      ? "left"
                      : "right",
              }}
            >
              {labels[index]}
            </span>
          ))}
        </div>
      ) : layout.stacked ? (
        <div className="flex flex-col gap-1">
          {layout.ticks.map((tick) => (
            <div key={tick.index} style={{ paddingLeft: tick.left }}>
              <span
                data-tick-index={tick.index}
                className="block wrap-anywhere"
                style={{ width: tick.width }}
              >
                {labels[tick.index]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="relative min-h-5">
          {layout.ticks.map((tick) => (
            <span
              key={tick.index}
              data-tick-index={tick.index}
              className="absolute whitespace-nowrap"
              style={{ left: tick.left }}
            >
              {labels[tick.index]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
