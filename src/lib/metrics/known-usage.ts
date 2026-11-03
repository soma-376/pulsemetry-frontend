export function pricingRowsText(value: {
  pricedUsageRows?: number;
  unpricedUsageRows?: number;
}) {
  return value.pricedUsageRows === undefined ||
    value.unpricedUsageRows === undefined
    ? ""
    : `환산 완료 ${value.pricedUsageRows.toLocaleString("ko-KR")}건 · 환산 미확인 ${value.unpricedUsageRows.toLocaleString("ko-KR")}건`;
}

/** 작은 양의 부분합도 0달러로 읽히지 않게 서버 금액 정밀도를 보존한다. */
export function knownMoneyText(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number(value) > 0 && Number(value) < 0.01 ? 6 : 2,
  }).format(Number(value));
}
