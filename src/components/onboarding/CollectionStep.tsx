"use client";

import { PromptCollectionField } from "@/components/settings/PromptCollectionField";
import { useOrganization } from "@/lib/organization-store";

export function CollectionStep() {
  const { state, update } = useOrganization();
  return <div className="flex flex-col gap-5">
    <p className="text-sm leading-6 text-text2">개발 도구에서 보낸 프롬프트와 응답의 원문을 저장할지 선택하세요. 이 설정은 나중에 설정 화면에서 변경할 수 있습니다.</p>
    <PromptCollectionField value={state.promptRaw} onChange={(promptRaw) => update((previous) => ({ ...previous, promptRaw }))} />
  </div>;
}
