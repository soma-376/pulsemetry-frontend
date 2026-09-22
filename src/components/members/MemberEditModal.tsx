"use client";

import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import type { MemberAssignmentTarget } from "@/lib/member-assignment";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/metrics/members";
import type { Team } from "@/lib/organization";
import { memberAssignmentSchema, memberRoleSchema, type MemberAssignment } from "@/lib/schemas/member";

type Props = {
  target: MemberAssignmentTarget | null;
  teams: Team[];
  onClose: () => void;
  onSave: (target: MemberAssignmentTarget, values: MemberAssignment) => void;
};

export function MemberEditModal({ target, teams, onClose, onSave }: Props) {
  return <Modal open={!!target} onClose={onClose} title="팀/역할 수정" subtitle={target?.account} width={420}>
    {target && <MemberEditForm target={target} teams={teams} onClose={onClose} onSave={onSave} />}
  </Modal>;
}

function MemberEditForm({ target, teams, onClose, onSave }: Props & { target: MemberAssignmentTarget }) {
  const id = useId();
  const { register, control, handleSubmit, setError, formState: { errors, isDirty, isSubmitting } } = useForm<MemberAssignment>({
    resolver: zodResolver(memberAssignmentSchema),
    defaultValues: { team: target.teamId, role: memberRoleSchema.parse(target.role) },
  });
  const role = useWatch({ control, name: "role" });
  return <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((values) => {
    try { onSave(target, values); } catch (error) {
      setError("root", { message: error instanceof Error ? error.message : "변경사항을 저장하지 못했습니다" });
    }
  })}>
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-team`} className="text-xs text-text2">팀</label>
      <Select id={`${id}-team`} {...register("team")} className="h-9" aria-invalid={!!errors.team} aria-describedby={`${id}-team-error`}>
        <option value="">미배정</option>
        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
      </Select>
      {errors.team && <p id={`${id}-team-error`} className="text-xs text-red">{errors.team.message}</p>}
    </div>
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-role`} className="text-xs text-text2">역할</label>
      <Select id={`${id}-role`} {...register("role")} className="h-9" aria-invalid={!!errors.role} aria-describedby={`${id}-role-hint`}>
        {memberRoleSchema.options.map((value) => <option key={value} value={value} disabled={target.reclaimed && value !== "viewer"}>{ROLE_LABEL[value]}</option>)}
      </Select>
      <p id={`${id}-role-hint`} className={`text-xs leading-5 ${errors.role ? "text-red" : "text-text3"}`}>
        {errors.role?.message ?? (target.reclaimed ? "좌석이 회수된 구성원은 조회 전용 역할을 유지합니다." : ROLE_HINT[role])}
      </p>
    </div>
    {target.invited && <p className="text-xs leading-5 text-text3">초대를 수락하면 변경한 팀과 역할이 적용됩니다.</p>}
    {errors.root && <p role="alert" className="text-xs text-red">{errors.root.message}</p>}
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <Button onClick={onClose}>취소</Button>
      <Button type="submit" variant="primary" disabled={!isDirty || isSubmitting}>변경 저장</Button>
    </div>
  </form>;
}
