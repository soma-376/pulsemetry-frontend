"use client";

import { useId, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { MemberAssignmentTarget } from "@/lib/member-assignment";
import { ROLE_LABEL } from "@/lib/metrics/members";
import type { Team } from "@/lib/organization";
import { memberAssignmentSchema, memberRoleSchema, type MemberAssignment } from "@/lib/schemas/member";

type Props = {
  target: MemberAssignmentTarget | null;
  teams: Team[];
  onSave: (target: MemberAssignmentTarget, values: MemberAssignment) => void;
  children: (slots: { fields: ReactNode; actions: ReactNode }) => ReactNode;
};

/** One form owns the member fields and the persistent drawer footer. */
export function MemberEditForm({ target, teams, onSave, children }: Props) {
  const id = useId();
  const { register, handleSubmit, setError, reset, setFocus, formState: { errors, isDirty, isSubmitting } } = useForm<MemberAssignment>({
    resolver: zodResolver(memberAssignmentSchema),
    defaultValues: { team: target?.teamId ?? "", role: target?.role ?? "member" },
  });
  const fields = <form id={id} noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((values) => {
    if (!target) return;
    try { onSave(target, values); reset(values); setFocus("role"); } catch (error) {
      setError("root", { message: error instanceof Error ? error.message : "변경사항을 저장하지 못했습니다" });
    }
  })}>
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`${id}-team`} className="text-[11px] text-text3">팀</label>
      <Select id={`${id}-team`} {...register("team")} className="h-9 w-full" aria-invalid={!!errors.team} aria-describedby={errors.team ? `${id}-team-error` : undefined}>
        <option value="">미배정</option>
        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
      </Select>
      {errors.team && <p id={`${id}-team-error`} className="text-xs text-red">{errors.team.message}</p>}
    </div>
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`${id}-role`} className="text-[11px] text-text3">역할</label>
      <Select id={`${id}-role`} {...register("role")} className="h-9 w-full" aria-invalid={!!errors.role} aria-describedby={errors.role ? `${id}-role-error` : undefined}>
        {memberRoleSchema.options.map((value) => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}
      </Select>
      {errors.role && <p id={`${id}-role-error`} className="text-xs text-red">{errors.role.message}</p>}
    </div>
    {target?.invited && <p className="text-xs leading-5 text-text3">초대를 수락하면 변경한 팀과 역할이 적용됩니다.</p>}
    {errors.root && <p role="alert" className="text-xs text-red">{errors.root.message}</p>}
  </form>;
  const actions = <div className="flex justify-end gap-2">
    <Button onClick={() => { reset(); setFocus("team"); }} disabled={!isDirty || isSubmitting}>취소</Button>
    <Button type="submit" form={id} variant="primary" disabled={!isDirty || isSubmitting}>변경사항 저장</Button>
  </div>;
  return children({ fields, actions });
}
