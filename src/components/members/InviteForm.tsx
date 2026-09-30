"use client";

import { useEffect, useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { InviteCode } from "./InviteCode";
import type { InvitationRequest, InvitationResult } from "@/lib/api/invitations";
import type { ServerTeam } from "@/lib/api/management";
import { ASSIGNABLE_ROLES, inviteResults, ROLE_HINT, ROLE_LABEL, type InviteResults } from "@/lib/members-view";

import {
  inviteFormSchema,
  inviteSubmissionSchema,
  type InviteForm as InviteFormValues,
} from "@/lib/schemas/invite";
import { useOrganization } from "@/lib/organization-store";

/**
 * 구성원 초대.
 *
 * 사내 구성원과 외부 협력사의 팀·역할을 지정해 초대 코드를 발급합니다.
 * 여러 명을 한 번에 넣을 수 있고, 두 명 이상이면 기본 배정 아래에서 개별로 바꿉니다 —
 * 한 명씩 초대하며 매번 팀을 고르는 것보다 빠릅니다.
 *
 * 발급은 발송이 아닙니다. 코드는 발급 직후에만 볼 수 있어, 창을 닫으면 화면에서 지웁니다.
 */
export function InviteForm({
  open = false,
  onClose,
  subtitle,
  teams,
  onInvite,
  inline = false,
}: {
  open?: boolean;
  inline?: boolean;
  onClose?: () => void;
  subtitle?: string;
  /** 서버의 팀 목록. 아직 읽지 못했으면 undefined */
  teams: ServerTeam[] | undefined;
  /** 초대 코드를 발급하고 서버의 결과를 돌려준다 */
  onInvite: (entries: InvitationRequest[]) => Promise<InvitationResult[]>;
}) {
  const { state: organization, update } = useOrganization();
  const formId = useId();
  const emailHintId = `${formId}-email-hint`;
  const {
    control,
    register,
    getValues,
    handleSubmit,
    trigger,
    reset,
    resetField,
    setError,
    setFocus,
    setValue,
    subscribe,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    mode: "onChange",
    defaultValues: inline
      ? organization.onboardingDraft.invite
      : { draft: "", team: "", role: "member", invitees: [] },
  });
  const {
    fields: invitees,
    append,
    remove,
  } = useFieldArray({
    control,
    name: "invitees",
  });
  const [team, role] = useWatch({ control, name: ["team", "role"] });
  const [sent, setSent] = useState<InviteResults | null>(null);

  useEffect(() => {
    if (!inline) return;
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        const invite = structuredClone(values);
        update((previous) => ({
          ...previous,
          onboardingDraft: { ...previous.onboardingDraft, invite },
        }));
      },
    });
  }, [inline, subscribe, update]);

  // 없어진 팀을 고른 채로 남기지 않는다. 목록을 읽기 전에는 판단하지 않는다.
  useEffect(() => {
    if (!teams) return;
    const values = getValues();
    const exists = (id: string) => teams.some((item) => item.teamId === id);
    if (values.team && !exists(values.team)) setValue("team", "");
    values.invitees.forEach((invitee, index) => {
      if (invitee.team && !exists(invitee.team))
        setValue(`invitees.${index}.team`, "");
    });
  }, [teams, getValues, setValue]);

  const invalid = Boolean(errors.draft);
  const multi = invitees.length > 1;

  const commit = async () => {
    if (!(await trigger("draft", { shouldFocus: true }))) return;
    // 연속 입력으로 값이 바뀌었을 수 있으므로 추가 직전의 값을 검사합니다.
    const result = inviteFormSchema.safeParse(getValues());
    if (!result.success || !result.data.draft) return;
    append(
      { email: result.data.draft, team: null, role: null },
      { shouldFocus: false },
    );
    resetField("draft");
    setSent(null);
  };

  const send = async (values: InviteFormValues) => {
    const result = inviteSubmissionSchema.safeParse(values);
    if (!result.success) {
      for (const issue of result.error.issues) {
        setError(issue.path.join(".") as FieldPath<InviteFormValues>, {
          type: "schema",
          message: issue.message,
        });
      }
      setFocus("draft");
      return;
    }
    try {
      // 서버가 발급을 확정한 결과만 보여 준다. 실패하면 입력을 그대로 둔다.
      const results = await onInvite(
        result.data.invitees.map((invitee) => ({
          email: invitee.email,
          teamId: (invitee.team ?? values.team) || null,
          role: invitee.role ?? values.role,
        })),
      );
      setSent(inviteResults(results));
    } catch (error) {
      setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "초대 코드를 발급하지 못했습니다",
      });
      return;
    }
    reset({ draft: "", team: values.team, role: values.role, invitees: [] });
  };

  const submitButton = (
    <Button
      type="submit"
      form={formId}
      variant="primary"
      disabled={invitees.length === 0}
      loading={isSubmitting}
      loadingLabel="발급 중…"
    >
      {invitees.length
        ? `${invitees.length}명 초대 코드 발급`
        : "초대 코드 발급"}
    </Button>
  );
  const form = (
    <form
      id={formId}
      onSubmit={handleSubmit(send)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium">이메일</span>
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card p-1.5"
          style={{ borderColor: invalid ? "var(--red)" : "var(--border)" }}
        >
          {invitees.map(({ id, email }, index) => (
            <span
              key={id}
              className="flex items-center gap-1 rounded bg-sub px-2 py-1 text-[11.5px]"
            >
              {email}
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`${email} 제거`}
                className="cursor-pointer text-base hover:text-text"
              >
                ×
              </button>
            </span>
          ))}
          <input
            {...register("draft")}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                void commit();
              }
            }}
            placeholder="name@company.com"
            aria-label="초대할 이메일"
            aria-invalid={invalid}
            aria-describedby={emailHintId}
            className="h-7 min-w-40 flex-1 border-0 bg-transparent px-1 text-[12px] text-text outline-none placeholder:text-text3"
          />
        </div>
        <span
          id={emailHintId}
          aria-live="polite"
          className="text-[11px]"
          style={{ color: invalid ? "var(--red)" : "var(--text3)" }}
        >
          {errors.draft?.message ?? "Enter 또는 쉼표로 추가 · 여러 명 가능"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-medium">
            {multi ? "기본 배정" : "배정"}
          </span>
          {multi && (
            <span className="text-[11px] text-text3">
              아래 목록에서 개별 변경 가능
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select {...register("team")} aria-label="팀">
            <option value="">팀 미배정</option>
            {(teams ?? []).map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.teamName}
              </option>
            ))}
          </Select>
          <Select {...register("role")} aria-label="역할">
            {ASSIGNABLE_ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>
        <span className="pretty text-[11px] text-text3">{ROLE_HINT[role]}</span>

        {multi && (
          <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-2">
            {invitees.map(({ id, email }, index) => (
              <div key={id} className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-0 flex-1 basis-40 overflow-hidden text-[11.5px] text-ellipsis whitespace-nowrap">
                  {email}
                </span>
                <Controller
                  control={control}
                  name={`invitees.${index}.team`}
                  render={({ field }) => (
                    <Select
                      {...field}
                      value={field.value ?? team}
                      aria-label={`${email} 팀`}
                      className="h-7"
                    >
                      <option value="">팀 미배정</option>
                      {(teams ?? []).map((t) => (
                        <option key={t.teamId} value={t.teamId}>
                          {t.teamName}
                        </option>
                      ))}
                    </Select>
                  )}
                />
                <Controller
                  control={control}
                  name={`invitees.${index}.role`}
                  render={({ field }) => (
                    <Select
                      {...field}
                      value={field.value ?? role}
                      aria-label={`${email} 역할`}
                      className="h-7"
                    >
                      {ASSIGNABLE_ROLES.map((value) => (
                        <option key={value} value={value}>
                          {ROLE_LABEL[value]}
                        </option>
                      ))}
                    </Select>
                  )}
                />
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`${email} 제거`}
                  className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-border text-text2 hover:bg-hover"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {errors.root && (
        <p role="alert" className="text-xs text-red">
          {errors.root.message}
        </p>
      )}

      {sent && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-border bg-sub px-3 py-2.5 text-[11.5px] text-text2"
        >
          <span className="pretty">
            {sent.summary}
            {sent.issued > 0 &&
              " · 코드는 지금만 볼 수 있습니다. 대상자에게 직접 전달하세요."}
          </span>
          <ul aria-label="초대 코드 발급 결과" className="flex flex-col gap-2">
            {sent.rows.map((row) => (
              <li key={row.email} className="flex flex-col gap-1">
                <span>
                  <span className="font-mono text-text">{row.email}</span> ·{" "}
                  {row.text}
                </span>
                {row.code && <InviteCode email={row.email} code={row.code} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="pretty rounded-md bg-sub px-3 py-2.5 text-[11.5px] text-text2">
        초대 코드로 가입하면 지정한 팀과 역할이 적용됩니다. 메일은 발송하지
        않으므로 발급된 코드를 대상자에게 전달해야 합니다.
      </p>
    </form>
  );
  if (inline)
    return (
      <div className="flex flex-col gap-4">
        {form}
        <div className="flex justify-end">{submitButton}</div>
      </div>
    );
  // 닫으면 발급된 코드를 화면에 남기지 않는다. 입력 중인 값은 그대로 둔다.
  const close = () => {
    if (isSubmitting) return;
    setSent(null);
    onClose?.();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="구성원 초대"
      subtitle={subtitle}
      width={560}
      footer={
        <>
          <div className="flex-1" />
          <Button onClick={close} disabled={isSubmitting}>
            {sent ? "완료" : "취소"}
          </Button>
          {submitButton}
        </>
      }
    >
      {form}
    </Modal>
  );
}
