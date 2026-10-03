"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SettingRow, SettingSection } from "./SettingRow";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Toggle } from "@/components/ui/Toggle";
import { ALERT_RULE_TEXT, alertReasonText, parseEntries, saveAlertList, saveAlertRule, type AlertList, type AlertRule } from "@/lib/api/alerts";
import { managementKey } from "@/lib/api/management";

const thresholdText = (rule: AlertRule) => rule.threshold.unit === "ratio" ? `${Math.round(rule.threshold.value * 100)}%`
  : `${rule.threshold.value}${rule.threshold.unit === "users" ? "명" : "회"}`;

/**
 * 알림 규칙(서버 ADR 0051) — 토글과 규칙이 기대는 두 목록. 켤 수 있는지는 서버의 가용성이 정하고, 켤 수 없으면 사유를 보여 준다.
 * 이미 켜진 규칙은 언제나 끌 수 있다. 임계값은 서버의 기준 데이터라 편집하지 않는다. 목록을 저장하면 응답의 규칙 상태로 토글을 바꾼다.
 */
export function AlertRulesSection({ organizationId, rules, lists, editable, onSaved }: {
  organizationId: string;
  rules: AlertRule[];
  lists?: { allowedModels: AlertList; approvedTools: AlertList };
  editable: boolean;
  onSaved: (message: string) => void;
}) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: managementKey(organizationId, "settings") });
  const toggle = useMutation({
    mutationFn: (rule: AlertRule) => saveAlertRule(organizationId, rule.ruleId, rule.version, !rule.enabled),
    onSuccess: (rule) => { onSaved(`${ALERT_RULE_TEXT[rule.ruleId]?.title ?? rule.ruleId}을 ${rule.enabled ? "켰습니다" : "껐습니다"}.`); return refresh(); },
    // 판이 맞지 않으면 최신 값을 다시 읽는다.
    onError: () => refresh(),
  });
  return <SettingSection id="alerts" title="알림 규칙">
    <div className="rounded-lg border border-border bg-card">
      {rules.map((rule, index) => {
        const label = ALERT_RULE_TEXT[rule.ruleId]?.title ?? rule.ruleId;
        const blocked = !rule.enabled && rule.availability !== "available";
        return <SettingRow key={rule.ruleId} first={index === 0} title={label} note={ALERT_RULE_TEXT[rule.ruleId]?.note ?? ""}>
          <div className="flex flex-col items-end gap-1 @max-[480px]:items-start">
            <div className="flex items-center gap-3"><span className="tnum text-xs">{thresholdText(rule)}</span>
              <Toggle on={rule.enabled} label={label} disabled={!editable || blocked || toggle.isPending} onChange={() => toggle.mutate(rule)} /></div>
            {rule.availability !== "available" && <span role="note" className="max-w-[260px] text-right text-[11px] text-orange-ink @max-[480px]:text-left">{alertReasonText(rule.reason)}</span>}
          </div>
        </SettingRow>;
      })}
      {toggle.error && <div className="border-t border-border px-4 py-3"><ErrorState variant="inline" message={toggle.error.message} /></div>}
      {lists && <>
        <ListEditor key={`models-${lists.allowedModels.version}`} organizationId={organizationId} list={lists.allowedModels} title="모델 허용 목록" editable={editable}
          note="줄마다 모델 이름 하나. 끝의 * 는 접두사 일치(예: claude-sonnet-*). 대소문자를 구분합니다. 목록 밖 모델의 호출이 비허용 모델 알림이 됩니다."
          onSaved={() => { onSaved("모델 허용 목록을 저장했습니다."); void refresh(); }} />
        <ListEditor key={`tools-${lists.approvedTools.version}`} organizationId={organizationId} list={lists.approvedTools} title="승인 도구 목록" editable={editable}
          note="줄마다 도구 이름 하나(예: Bash). 수집 도구가 가린 MCP 도구 이름(mcp_tool)은 개별로 구분되지 않습니다."
          onSaved={() => { onSaved("승인 도구 목록을 저장했습니다."); void refresh(); }} />
      </>}
    </div>
  </SettingSection>;
}

function ListEditor({ organizationId, list, title, note, editable, onSaved }: {
  organizationId: string; list: AlertList; title: string; note: string; editable: boolean; onSaved: () => void;
}) {
  const [text, setText] = useState(list.entries.join("\n"));
  const save = useMutation({ mutationFn: () => saveAlertList(organizationId, list.listId, list.version, parseEntries(text)), onSuccess: onSaved });
  const changed = parseEntries(text).join("\n") !== list.entries.join("\n");
  return <div className="flex flex-col gap-2 border-t border-border px-4 py-3.5">
    <div className="flex items-baseline justify-between gap-2"><span className="text-[12.5px] font-semibold">{title}</span>
      <span className="text-[11px] text-text3">{list.entries.length}개 · 판 {list.version}</span></div>
    <span className="pretty text-[11.5px] text-text2">{note}</span>
    <textarea aria-label={title} className="min-h-20 rounded-md border border-border bg-card p-2 font-mono text-[11px]" value={text} readOnly={!editable}
      onChange={(event) => { setText(event.target.value); save.reset(); }} />
    {save.error && <ErrorState variant="inline" message={save.error.message} />}
    {editable && <div className="flex justify-end"><Button size="sm" variant="primary" loading={save.isPending} loadingLabel="저장 중…" disabled={!changed || save.isPending}
      onClick={() => save.mutate()}>{title} 저장</Button></div>}
  </div>;
}
