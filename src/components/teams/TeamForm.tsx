"use client";
import { useId, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  teamFormSchema,
  TEAM_NAME_HINT,
  type TeamForm as TeamFormValues,
} from "@/lib/schemas/team";

/** 팀 이름 입력. 저장은 호출한 화면의 서버 명령이 하고, 실패하면 입력을 그대로 둔다. */
export function TeamForm({
  team,
  onDone,
  onCancel,
  onSave,
  draftName,
  onDraftChange,
  recovery,
}: {
  team: { teamName: string } | null;
  onDone: (name: string) => void;
  onCancel?: () => void;
  draftName?: string;
  onDraftChange?: (name: string) => void;
  onSave: (name: string) => Promise<void>;
  /** 저장 실패 뒤의 복구 동작 (예: 최신 내용 불러오기) */
  recovery?: ReactNode;
}) {
  const fieldId = useId();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: { name: team?.teamName ?? draftName ?? "" },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSave(values.name);
          onDraftChange?.("");
          reset({ name: "" });
          onDone(values.name);
        } catch (error) {
          setError(
            "name",
            {
              message:
                error instanceof Error
                  ? error.message
                  : "팀을 저장하지 못했습니다",
            },
            { shouldFocus: true },
          );
        }
      })}
    >
      <h3 className="text-sm font-semibold">
        {team ? "팀 이름 수정" : "팀 만들기"}
      </h3>
      <label htmlFor={fieldId} className="text-xs text-text2">
        팀 이름
      </label>
      <Input
        id={fieldId}
        {...register("name", {
          onChange: (event) => onDraftChange?.(event.target.value),
        })}
        className="h-10"
        maxLength={40}
        aria-invalid={!!errors.name}
        aria-describedby={`${fieldId}-error`}
      />
      <p
        id={`${fieldId}-error`}
        aria-live="polite"
        className={`text-xs ${errors.name ? "text-red" : "text-text3"}`}
      >
        {errors.name?.message ?? TEAM_NAME_HINT}
      </p>
      {recovery}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button onClick={onCancel} disabled={isSubmitting}>
            취소
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          loadingLabel="저장 중…"
        >
          {team ? "변경 저장" : "팀 생성"}
        </Button>
      </div>
    </form>
  );
}
