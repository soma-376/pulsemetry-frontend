export type TimeAxisTick = { index: number; left: number; width: number };
export type TimeAxisLayout = { stacked: boolean; ticks: TimeAxisTick[] };

/** 실제 시간 위치와 글자 폭으로 배치한다. 양끝을 우선하고 중간 눈금만 생략한다. */
export function timeAxisLayout(
  positions: readonly number[],
  labelWidths: readonly number[],
  availableWidth: number,
): TimeAxisLayout {
  if (availableWidth <= 0 || positions.length === 0)
    return { stacked: false, ticks: [] };
  const last = positions.length - 1;
  const box = (index: number): TimeAxisTick => {
    const width = Math.min(labelWidths[index], availableWidth);
    const offset =
      last === 0
        ? width / 2
        : index === 0
          ? 0
          : index === last
            ? width
            : width / 2;
    return {
      index,
      width,
      left: Math.max(
        0,
        Math.min(
          availableWidth - width,
          (positions[index] / 100) * availableWidth - offset,
        ),
      ),
    };
  };
  const first = box(0);
  if (last === 0)
    return { stacked: labelWidths[0] > availableWidth, ticks: [first] };
  const end = box(last);
  const fitsAfter = (left: TimeAxisTick, right: TimeAxisTick) =>
    left.left + left.width + 8 <= right.left;
  if (!fitsAfter(first, end)) return { stacked: true, ticks: [first, end] };

  const ticks = [first];
  const step = Math.max(1, Math.ceil(last / 5));
  for (let index = step; index < last; index += step) {
    const tick = box(index);
    if (fitsAfter(ticks[ticks.length - 1], tick) && fitsAfter(tick, end))
      ticks.push(tick);
  }
  return { stacked: false, ticks: [...ticks, end] };
}
