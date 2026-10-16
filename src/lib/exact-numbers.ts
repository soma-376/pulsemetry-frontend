/** JSON의 정수 토큰을 Number 반올림 전에 보존한다. 일반 숫자·문자열은 그대로 둔다. */
export function parseJsonExactIntegers(text: string): unknown {
  return JSON.parse(
    text,
    (_key, value: unknown, context?: { source?: string }) => {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        !Number.isSafeInteger(value) &&
        context?.source &&
        /^-?\d+$/.test(context.source)
      )
        return BigInt(context.source);
      // 원문을 지원하지 않는 환경에서는 기존 safe-integer 스키마가 거절한다.
      // 반올림된 숫자를 BigInt로 바꿔 정확한 값처럼 취급하지 않는다.
      return value;
    },
  );
}

/** 서버의 십진 금액 문자열을 기존 USD 표시 규칙(소수점 둘째 자리)으로 반올림한다. */
export function decimalUsd(value: string): string {
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!parts) throw new Error("유효한 십진 금액이 아닙니다.");
  const [, sign, whole, fraction = ""] = parts;
  let cents =
    BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  if (fraction.length > 2 && fraction[2] >= "5") cents += BigInt(1);
  return (
    "$" +
    sign +
    (cents / BigInt(100)).toLocaleString("en-US") +
    "." +
    (cents % BigInt(100)).toString().padStart(2, "0")
  );
}
