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
import { INVITE_TTL_DAYS, ROLE_HINT, ROLE_LABEL } from "@/lib/metrics/members";

import {
  inviteFormSchema,
  inviteSubmissionSchema,
  type InviteForm as InviteFormValues,
} from "@/lib/schemas/invite";
import { useOrganization } from "@/lib/organization-store";
import { teamLabel } from "@/lib/organization";

/**
 * 구성원 초대.
 *
 * 사내 구성원과 외부 협력사의 팀·역할을 지정해 초대합니다.
 * 여러 명을 한 번에 넣을 수 있고, 두 명 이상이면 기본 배정 아래에서 개별로 바꿉니다 —
 * 한 명씩 초대하며 매번 팀을 고르는 것보다 빠릅니다.
 */
export function InviteForm({
  open = false,
  onClose,
  seatStatus,
  onInvite,
  inline = false,
}: {
  open?: boolean;
  inline?: boolean;
  onClose?: () => void;
  seatStatus: string;
  /** 보낸 초대를 대기 목록으로 넘깁니다 */
  onInvite: (entries: { email: string; team: string; role: string }[]) => void;
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
  const [sent, setSent] = useState<string | null>(null);

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

  useEffect(() => {
    const values = getValues();
    const exists = (id: string) =>
      organization.teams.some((item) => item.id === id);
    if (values.team && !exists(values.team)) setValue("team", "");
    values.invitees.forEach((invitee, index) => {
      if (invitee.team && !exists(invitee.team))
        setValue(`invitees.${index}.team`, "");
    });
  }, [organization.teams, getValues, setValue]);

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

  const send = (values: InviteFormValues) => {
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
    // 배정 요약을 만들어 "몇 명을 어디로 보냈는지"를 닫기 전에 확인시킵니다
    const byTeam: Record<string, number> = {};
    const roles = new Set<string>();
    for (const invitee of values.invitees) {
      const t = invitee.team ?? values.team;
      const key = teamLabel(organization.teams, t) || "팀 미배정";
      byTeam[key] = (byTeam[key] ?? 0) + 1;
      roles.add(ROLE_LABEL[invitee.role ?? values.role]);
    }
    const teamPart = Object.entries(byTeam)
      .map(([k, v]) => `${k} ${v}명`)
      .join(" · ");
    const rolePart = roles.size === 1 ? [...roles][0] : `역할 ${roles.size}종`;

    // 보낸 초대는 목록에 남아야 합니다 — 이 창을 닫으면 누구를 불렀는지 확인할 데가 없습니다
    onInvite(
      values.invitees.map((invitee) => ({
        email: invitee.email,
        team: invitee.team ?? values.team,
        role: invitee.role ?? values.role,
      })),
    );

    setSent(
      `데모 초대 ${values.invitees.length}명을 추가했습니다 — ${teamPart} · ${rolePart} · ${INVITE_TTL_DAYS}일 후 만료 · 실제 메일은 발송하지 않습니다`,
    );
    reset({ draft: "", team: values.team, role: values.role, invitees: [] });
  };

  const submitButton = (
    <Button
      type="submit"
      form={formId}
      variant="primary"
      disabled={invitees.length === 0 || isSubmitting}
    >
      {invitees.length
        ? `${invitees.length}명에게 초대 메일 발송`
        : "초대 메일 발송"}
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
            placeholder="name@codeworks.io"
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
            {organization.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select {...register("role")} aria-label="역할">
            <option value="member">구성원</option>
            <option value="lead">팀 리드 (자기 팀만)</option>
            <option value="viewer">조회 전용</option>
            <option value="admin">관리자</option>
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
                      {organization.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
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
                      <option value="member">구성원</option>
                      <option value="lead">팀 리드</option>
                      <option value="viewer">조회 전용</option>
                      <option value="admin">관리자</option>
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

      {sent && (
        <div
          role="status"
          className="pretty rounded-md border border-border bg-sub px-3 py-2.5 text-[11.5px] text-text2"
        >
          {sent}
        </div>
      )}

      <p className="pretty rounded-md bg-sub px-3 py-2.5 text-[11.5px] text-text2">
        초대를 수락하면 지정한 팀과 역할이 적용됩니다.
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
  return (
    <Modal
      open={open}
      onClose={onClose ?? (() => {})}
      title="구성원 초대"
      subtitle={seatStatus}
      width={560}
      footer={
        <>
          <div className="flex-1" />
          <Button onClick={onClose}>취소</Button>
          {submitButton}
        </>
      }
    >
      {form}
    </Modal>
  );
}
