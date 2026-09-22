import { fromIso, toIso } from "./date";

function groupDigits(value: string, separator: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join(separator);
}

/** 입력 중인 불완전한 값도 보존하고, 완성된 날짜는 ISO 일자로 저장합니다. */
export const dateInputValue = (text: string) => groupDigits(text, "-");
export const dateInputText = (value: string) => groupDigits(value, ".");

export function dateInputError(value: string, min?: string): string | null {
  if (!value) return null;
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return "날짜를 YYYY.MM.DD 형식으로 입력하세요";
  if (toIso(fromIso(value)) !== value) return "존재하지 않는 날짜입니다. 연·월·일을 확인하세요";
  if (min && value < min) return `${dateInputText(min)} 이전 날짜는 선택할 수 없습니다`;
  return null;
}
