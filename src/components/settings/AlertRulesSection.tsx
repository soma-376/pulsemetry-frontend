"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SettingRow, SettingSection } from "./SettingRow";
import { ErrorState } from "@/components/ui/ErrorState";
import { Toggle } from "@/components/ui/Toggle";
import {
  ALERT_RULE_TEXT,
  alertReasonText,
  saveAlertRule,
  type AlertRule,
} from "@/lib/api/alerts";
import { managementKey } from "@/lib/api/management";

const thresholdText = (rule: AlertRule) =>
  rule.threshold.unit === "ratio"
    ? `${Math.round(rule.threshold.value * 100)}%`
    : `${rule.threshold.value}${rule.threshold.unit === "users" ? "명" : "회"}`;

/**
 * 알림 규칙(허브 ADR 0008). 등록 제품을 기준으로 서버가 가용성을 정한다.
 * 이미 켜진 규칙은 언제나 끌 수 있다. 임계값은 서버의 기준 데이터라 편집하지 않는다.
 */
export function AlertRulesSection({
  organizationId,
  rules,
  editable,
  onSaved,
}: {
  organizationId: string;
  rules: AlertRule[];
  editable: boolean;
  onSaved: (message: string) => void;
}) {
  const client = useQueryClient();
  // 이전 서버의 응답에서도 폐기한 규칙은 편집하지 않는다. 과거 알림의 표시는 유지한다.
  const currentRules = rules.filter(
    (rule) => !["model_not_allowed", "tool_unapproved"].includes(rule.ruleId),
  );
  const refresh = () =>
    client.invalidateQueries({
      queryKey: managementKey(organizationId, "settings"),
    });
  const toggle = useMutation({
    mutationFn: (rule: AlertRule) =>
      saveAlertRule(organizationId, rule.ruleId, rule.version, !rule.enabled),
    onSuccess: (rule) => {
      onSaved(
        `${ALERT_RULE_TEXT[rule.ruleId]?.title ?? rule.ruleId}을 ${rule.enabled ? "켰습니다" : "껐습니다"}.`,
      );
      return refresh();
    },
    // 판이 맞지 않으면 최신 값을 다시 읽는다.
    onError: () => refresh(),
  });
  return (
    <SettingSection id="alerts" title="알림 규칙">
      <div className="rounded-lg border border-border bg-card">
        {currentRules.map((rule, index) => {
          const label = ALERT_RULE_TEXT[rule.ruleId]?.title ?? rule.ruleId;
          const blocked = !rule.enabled && rule.availability !== "available";
          return (
            <SettingRow
              key={rule.ruleId}
              first={index === 0}
              title={label}
              note={ALERT_RULE_TEXT[rule.ruleId]?.note ?? ""}
            >
              <div className="flex flex-col items-end gap-1 @max-[480px]:items-start">
                <div className="flex items-center gap-3">
                  <span className="tnum text-xs">{thresholdText(rule)}</span>
                  <Toggle
                    on={rule.enabled}
                    label={label}
                    disabled={!editable || blocked || toggle.isPending}
                    onChange={() => toggle.mutate(rule)}
                  />
                </div>
                {rule.availability !== "available" && (
                  <span
                    role="note"
                    className="max-w-[260px] text-right text-[11px] text-orange-ink @max-[480px]:text-left"
                  >
                    {alertReasonText(rule.reason)}
                  </span>
                )}
              </div>
            </SettingRow>
          );
        })}
        {toggle.error && (
          <div className="border-t border-border px-4 py-3">
            <ErrorState variant="inline" message={toggle.error.message} />
          </div>
        )}
      </div>
    </SettingSection>
  );
}
