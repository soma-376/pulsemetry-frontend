import { MODEL_META, MODEL_COLORS } from "@/mocks/overview";
import { usd } from "@/lib/format";

/** Only observed models participate in the mix; catalog entries with zero usage are omitted. */
export function buildOverviewModelMix(teams: { models: Record<string, number> }[]) {
  const totals = new Map<string, number>();
  for (const team of teams) for (const [id, cost] of Object.entries(team.models)) totals.set(id, (totals.get(id) ?? 0) + cost);
  const models = [...totals].filter(([, cost]) => cost > 0).map(([v, cost]) => {
    const meta = MODEL_META.find((model) => model.v === v);
    return { v, name: meta?.name ?? v, cost, color: MODEL_COLORS[v] ?? "var(--gray)", sub: meta ? `${usd(meta.perM)}/M` : "단가 미등록" };
  }).sort((a, b) => b.cost - a.cost);
  const total = models.reduce((sum, model) => sum + model.cost, 0);
  const top = models.slice(0, 4);
  const rest = models.slice(4);
  const displayed = rest.length ? [...top, { v: "__rest", name: `기타 ${rest.length}개 모델`, cost: rest.reduce((sum, model) => sum + model.cost, 0), color: "var(--gray)", sub: rest.map((model) => model.name).slice(0, 3).join(" · ") }] : top;
  const slices = displayed.map((model) => ({ ...model, share: model.cost / total * 100 }));
  const rows = slices.map((model) => ({ name: model.name, shareText: `${model.share.toFixed(1)}%`, perMText: model.sub, color: model.color, costText: usd(model.cost), tip: `${model.name} · 환산가치 비중 ${model.share.toFixed(1)}% · ${model.sub}` }));
  const topName = models[0]?.name ?? "관측 없음";
  const topShare = models.length ? `${(models[0].cost / total * 100).toFixed(1)}%` : "—";
  return {
    count: models.length, slices, rows, topName, topShare,
    headline: models.length ? `${topName}이 환산가치의 ${topShare}를 차지` : "관측된 모델이 없습니다",
    detail: "선택 기간의 환산가치 · 모델을 선택하면 비중을 확인할 수 있어요",
  };
}
