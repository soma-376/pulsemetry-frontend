"use client";

import { useId, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlannedVendorPicker,
  PlannedVendorQueryState,
  usePlannedVendors,
} from "./PlannedVendorPicker";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { ManagementError, type ServerTeam } from "@/lib/api/management";
import {
  memberChange,
  saveMember,
  type MemberBaseline,
} from "@/lib/api/member-commands";
import { organizationKey } from "@/lib/api/query-keys";
import { ASSIGNABLE_ROLES, ROLE_HINT, ROLE_LABEL } from "@/lib/members-view";

/** 편집 대상. 구성원과 초대 대기자 모두 서버의 memberId와 version으로 가리킨다. */
export type MemberEditTarget = MemberBaseline & {
  account: string;
  invited: boolean;
};
type Values = { team: string; role: string; plannedVendorIds: string[] };

type Props = {
  organizationId: string;
  target: MemberEditTarget | null;
  teams: ServerTeam[];
  /** 자기 자신은 역할을 바꿀 수 없다 */
  self: boolean;
  editable: boolean;
  onSaved: (message: string) => void;
  /** 충돌 뒤 최신 값을 다시 읽는다. 찾지 못하면 예외를 던진다. */
  onReload: () => Promise<MemberEditTarget>;
  children: (slots: { fields: ReactNode; actions: ReactNode }) => ReactNode;
};

const valuesOf = (target: MemberEditTarget | null): Values => ({
  team: target?.teamId ?? "",
  role: target?.role ?? "member",
  plannedVendorIds: target?.plannedVendorIds ?? [],
});

/**
 * 구성원의 팀·역할 편집. 폼 하나가 입력과 드로어 하단 버튼을 함께 가진다.
 * 서버가 저장을 확정한 뒤에만 화면을 바꾸고, 충돌하면 자동으로 덮어쓰지 않는다.
 */
export function MemberEditForm({
  organizationId,
  target,
  teams,
  self,
  editable,
  onSaved,
  onReload,
  children,
}: Props) {
  const id = useId();
  const vendors = usePlannedVendors(organizationId, !!target);
  const client = useQueryClient();
  // 열어 둔 사이 목록이 다시 조회돼도 입력과 기준 version을 바꾸지 않는다.
  const [baseline, setBaseline] = useState(target);
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    control,
    formState: { isDirty },
  } = useForm<Values>({ defaultValues: valuesOf(target) });
  const role = useWatch({ control, name: "role" });
  const save = useMutation({
    retry: false,
    mutationFn: async (values: Values) => {
      // 잠긴 역할 입력은 값을 내지 않으므로 기준 값을 쓴다.
      const change =
        baseline &&
        memberChange(baseline, {
          teamId: values.team || null,
          role: self ? baseline.role : (values.role ?? baseline.role),
          plannedVendorIds: values.plannedVendorIds,
        });
      if (!baseline || !change) throw new Error("변경한 내용이 없습니다.");
      return saveMember(organizationId, baseline.memberId, change);
    },
    onSuccess: async (_, values) => {
      // 목록을 새로 읽은 뒤에 끝낸다 — 바로 다시 열어도 새 version으로 시작한다.
      await client.invalidateQueries({
        queryKey: organizationKey(organizationId),
      });
      if (baseline)
        onSaved(
          `${baseline.account}의 ${baseline.invited ? "초대 " : ""}${memberChange(baseline, { teamId: values.team || null, role: baseline.role, plannedVendorIds: values.plannedVendorIds })?.plannedVendorIds ? "설정" : "팀·역할"}을 변경했습니다.`,
        );
    },
    onError: (error) => {
      // 없어진 팀이나 구성원이면 선택지를 새로 읽는다.
      if (error instanceof ManagementError && error.code === "not_found")
        void client.invalidateQueries({
          queryKey: organizationKey(organizationId),
        });
    },
  });
  const reload = useMutation({
    retry: false,
    mutationFn: onReload,
    onSuccess: (latest) => {
      setBaseline(latest);
      reset(valuesOf(latest));
      save.reset();
    },
  });
  const conflict =
    save.error instanceof ManagementError &&
    save.error.code === "version_conflict";
  const busy = save.isPending || reload.isPending;
  const locked = !editable || busy || conflict;
  const knownRole = (ASSIGNABLE_ROLES as readonly string[]).includes(
    baseline?.role ?? "member",
  );

  const fields = (
    <form
      id={id}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        if (!locked) save.mutate(values);
      })}
    >
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-team`} className="text-[11px] text-text3">
            팀
          </label>
          <Select
            id={`${id}-team`}
            {...register("team", { onChange: () => save.reset() })}
            className="h-9 w-full"
          >
            <option value="">미배정</option>
            {teams.map((team) => (
              <option key={team.teamId} value={team.teamId}>
                {team.teamName}
              </option>
            ))}
            {/* 목록에 없는 팀(삭제됐거나 아직 못 읽은 팀)에 있어도 현재 값을 잃지 않는다. */}
            {baseline?.teamId &&
              !teams.some((team) => team.teamId === baseline.teamId) && (
                <option value={baseline.teamId}>현재 팀</option>
              )}
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-role`} className="text-[11px] text-text3">
            역할
          </label>
          <Select
            id={`${id}-role`}
            {...register("role", { onChange: () => save.reset() })}
            disabled={self}
            className="h-9 w-full"
            aria-describedby={`${id}-role-access${self ? ` ${id}-role-hint` : ""}`}
          >
            {!knownRole && baseline && (
              <option value={baseline.role} disabled>
                {ROLE_LABEL[baseline.role] ?? baseline.role}
              </option>
            )}
            {ASSIGNABLE_ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </Select>
          {ROLE_HINT[role] && (
            <p
              id={`${id}-role-access`}
              className="pretty text-[11px] text-text3"
            >
              {ROLE_HINT[role]}
            </p>
          )}
          {self && (
            <p id={`${id}-role-hint`} className="text-[11px] text-text3">
              자기 역할은 바꿀 수 없습니다.
            </p>
          )}
        </div>
        <PlannedVendorQueryState query={vendors} />
        {vendors.data && !vendors.isError && (
          <Controller
            control={control}
            name="plannedVendorIds"
            render={({ field }) => (
              <PlannedVendorPicker
                options={vendors.data.vendors.items}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  save.reset();
                }}
              />
            )}
          />
        )}
        <p className="text-[11px] text-text3">
          사용 예정 제품이며 실제 벤더 좌석은 별도로 배정합니다.
        </p>
      </fieldset>
      {baseline?.invited && (
        <p className="text-xs leading-5 text-text3">
          초대를 수락하면 변경한 팀과 역할이 적용됩니다.
        </p>
      )}
      {!editable && (
        <p className="text-xs leading-5 text-text3">
          관리 기능이 꺼져 있어 팀과 역할을 변경할 수 없습니다.
        </p>
      )}
      {(save.error || reload.error) && (
        <ErrorState message={(reload.error ?? save.error)!.message}>
          {conflict && (
            <Button
              size="sm"
              loading={reload.isPending}
              loadingLabel="불러오는 중…"
              onClick={() => reload.mutate()}
            >
              입력 취소 후 최신 내용 불러오기
            </Button>
          )}
        </ErrorState>
      )}
    </form>
  );
  const actions = (
    <div className="flex justify-end gap-2">
      <Button
        onClick={() => {
          reset();
          save.reset();
          setFocus("team");
        }}
        disabled={!isDirty || locked}
      >
        취소
      </Button>
      <Button
        type="submit"
        form={id}
        variant="primary"
        loading={save.isPending}
        loadingLabel="저장 중…"
        disabled={!isDirty || locked}
      >
        변경사항 저장
      </Button>
    </div>
  );
  return children({ fields, actions });
}
