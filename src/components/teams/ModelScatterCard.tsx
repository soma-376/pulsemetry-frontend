import { ScatterPlot } from "@/components/charts/ScatterPlot";
import { usd } from "@/lib/format";
import { tokenText, type TeamsModel } from "@/lib/metrics/teams-presentation";

/**
 * 모델별 토큰 대비 비용.
 *
 * 점선은 전사 평균 단가입니다. 선 위에 앉은 모델은 평균보다 비싸게 사고 있다는 뜻이고,
 * 점 크기는 그 모델을 실제로 쓰는 팀 수 — 비싼데 널리 쓰이면 가장 먼저 손볼 대상입니다.
 * 값은 서버의 모델 산점도(조직 전체, 미배정 포함)이고, 금액·토큰을 모르는 모델은 점으로 그리지 않습니다.
 */
export function ModelScatterCard({ model }: { model: TeamsModel }) {
  const { scatter } = model;

  return (
    <section
      aria-label="모델별 토큰 대비 비용"
      className="col-span-2 flex min-w-0 flex-col rounded-[10px] border border-border bg-card p-4 @max-[1100px]:col-span-full"
    >
      <span className="mb-3 text-[12px] font-semibold">
        모델별 토큰 대비 비용
      </span>
      {scatter.note && <p className="mb-2 text-[11px] text-text3">{scatter.note}</p>}

      <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-2">
        <div className="tnum flex h-[206px] flex-col justify-between text-right text-[11px] text-text3">
          <span>{usd(scatter.yMax)}</span>
          <span>{usd(scatter.yMax / 2)}</span>
          <span>0</span>
        </div>

        <div className="relative h-[206px] border-b border-l border-border">
          <ScatterPlot
            points={scatter.points}
            xMax={scatter.xMax}
            yMax={scatter.yMax}
            referenceSlope={scatter.avgPerM}
          />
        </div>

        <div />
        <div className="tnum flex justify-between text-[11px] text-text3">
          <span>0</span>
          <span>{tokenText(scatter.xMax * 1e6)} 토큰</span>
        </div>
      </div>
    </section>
  );
}
