"use client";
import { Toggle } from "@/components/ui/Toggle";

export function PromptCollectionField({ value, onChange, compact = false }: { value: boolean | null; onChange: (value: boolean) => void; compact?: boolean }) {
  if (compact) return <Toggle on={value === true} label="프롬프트 원문 수집" onColor="var(--red)" onChange={() => onChange(!value)} />;
  return <fieldset className="flex flex-col gap-3">
    <legend className="mb-3 text-sm font-medium">프롬프트 원문 수집 여부</legend>
    {[{ value: false, title: "수집하지 않음", description: "원문을 저장하지 않고 사용량과 토큰 수만 집계합니다." },
      { value: true, title: "수집함", description: "프롬프트와 응답 본문을 저장합니다. 코드나 개인정보가 포함될 수 있습니다." }].map((option) =>
      <label key={String(option.value)} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${value === option.value ? "border-text bg-sub" : "border-border bg-card hover:bg-hover"}`}>
        <input type="radio" name="promptRaw" value={String(option.value)} checked={value === option.value} onChange={() => onChange(option.value)} className="mt-1 accent-[var(--text)]" />
        <span><span className="block text-sm font-medium">{option.title}</span><span className="mt-1 block text-xs leading-5 text-text2">{option.description}</span></span>
      </label>)}
  </fieldset>;
}
