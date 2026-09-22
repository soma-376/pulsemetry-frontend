"use client";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  teamFormSchema,
  type TeamForm as TeamFormValues,
} from "@/lib/schemas/team";
import { saveTeam, type Team } from "@/lib/organization";
import { useOrganization } from "@/lib/organization-store";
export function TeamForm({
  team,
  onDone,
  onCancel,
  persistDraft = false,
}: {
  team: Team | null;
  onDone: (name: string) => void;
  onCancel?: () => void;
  persistDraft?: boolean;
}) {
  const { state, update } = useOrganization();
  const fieldId = useId();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: team?.name ?? (persistDraft ? state.onboardingDraft.teamName : ""),
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        try {
          const next = saveTeam(
            state,
            values,
            team?.id ?? `team-${crypto.randomUUID()}`,
            !!team,
          );
          update(() =>
            persistDraft
              ? {
                  ...next,
                  onboardingDraft: { ...next.onboardingDraft, teamName: "" },
                }
              : next,
          );
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
          onChange: (event) => {
            if (persistDraft)
              update((previous) => ({
                ...previous,
                onboardingDraft: {
                  ...previous.onboardingDraft,
                  teamName: event.target.value,
                },
              }));
          },
        })}
        className="h-10"
        maxLength={40}
        aria-invalid={!!errors.name}
        aria-describedby={`${fieldId}-error`}
      />
      <p
        id={`${fieldId}-error`}
        aria-live="polite"
        className="text-xs text-red"
      >
        {errors.name?.message}
      </p>
      <div className="flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>취소</Button>}
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {team ? "변경 저장" : "팀 생성"}
        </Button>
      </div>
    </form>
  );
}
