/** 양수 값이 있으면 그 크기에 맞춘다. 0·확인 불가뿐인 축만 기본 범위를 쓴다. */
export function trendAxisMax(
  values: readonly (number | null)[],
  headroom: number,
) {
  const peak = values.reduce<number>(
    (max, value) =>
      value !== null && Number.isFinite(value) ? Math.max(max, value) : max,
    0,
  );
  return peak > 0 ? peak * headroom : 1;
}

/** 축의 두 양수 눈금이 센트 미만이어도 0으로 뭉개지지 않게 같은 정밀도로 표시한다. */
export function costAxisLabel(value: number, max: number) {
  const step = max / 2;
  const precision =
    Number.isFinite(step) && step > 0
      ? Math.min(20, Math.max(2, Math.ceil(-Math.log10(step))))
      : 2;
  return (
    "$" +
    value.toLocaleString("en-US", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    })
  );
}
