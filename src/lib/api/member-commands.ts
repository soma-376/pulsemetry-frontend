import { z } from "zod";
import { apiJson, orgPath, teamSchema, type createCommands, type ServerTeam } from "./management";

type Post = ReturnType<typeof createCommands>;

export const memberSavedSchema = z.object({
  memberId: z.string(), team: z.object({ teamId: z.string(), teamName: z.string() }).nullable(),
  role: z.string(), status: z.string(), version: z.number(),
  plannedVendorIds: z.array(z.string()).optional(),
});
export type MemberSaved = z.infer<typeof memberSavedSchema>;
/** 편집기가 값을 채운 시점의 구성원. version은 그때 조회가 준 값이다. */
export type MemberBaseline = { memberId: string; teamId: string | null; role: string; version: number; plannedVendorIds?: string[] };
export type MemberChange = { expectedVersion: number; teamId?: string | null; role?: string; plannedVendorIds?: string[] };

/**
 * 바꾼 필드만 담는다. 바뀐 것이 없으면 null.
 * 구성원 목록은 owner도 admin으로 보여 주므로, 바꾸지 않은 역할을 보내면 owner의 팀 변경이 거절된다.
 */
export function memberChange(baseline: MemberBaseline, next: { teamId: string | null; role: string; plannedVendorIds?: string[] }): MemberChange | null {
  const change: MemberChange = { expectedVersion: baseline.version };
  if (next.teamId !== baseline.teamId) change.teamId = next.teamId;
  if (next.role !== baseline.role) change.role = next.role;
  if (next.plannedVendorIds && JSON.stringify([...next.plannedVendorIds].sort()) !== JSON.stringify([...(baseline.plannedVendorIds ?? [])].sort())) change.plannedVendorIds = next.plannedVendorIds;
  return "teamId" in change || "role" in change || "plannedVendorIds" in change ? change : null;
}

export const saveMember = (organizationId: string, memberId: string, change: MemberChange) =>
  apiJson("enrollment", orgPath(organizationId, `/members/${encodeURIComponent(memberId)}`), memberSavedSchema, { method: "PATCH", body: JSON.stringify(change) });

/** 서버가 한 요청에서 받는 팀 배정의 최대 인원. */
export const ASSIGNMENT_LIMIT = 100;
export type TeamAssignment = { memberId: string; teamId: string; expectedVersion: number };
const assignedSchema = z.object({ effectiveAt: z.string(), members: z.array(z.object({ memberId: z.string(), teamId: z.string().nullable(), version: z.number() })) });

/** 고른 팀이 있는 행만, 한 요청의 한도까지 배정 목록으로 만든다. 화면에서 사라진 구성원의 선택은 버린다. */
export function teamAssignments(rows: readonly { memberId: string; version: number }[], picks: Readonly<Record<string, string>>): TeamAssignment[] {
  return rows.filter((row) => picks[row.memberId]).slice(0, ASSIGNMENT_LIMIT)
    .map((row) => ({ memberId: row.memberId, teamId: picks[row.memberId], expectedVersion: row.version }));
}
export const assignTeams = (post: Post, organizationId: string, assignments: TeamAssignment[]) =>
  post(organizationId, "/member-team-assignments", { assignments }, assignedSchema);

export const createTeam = (post: Post, organizationId: string, teamName: string) => post(organizationId, "/teams", { teamName }, teamSchema);
export const renameTeam = (organizationId: string, team: ServerTeam, teamName: string) =>
  apiJson("enrollment", orgPath(organizationId, `/teams/${encodeURIComponent(team.teamId)}`), teamSchema, { method: "PATCH", body: JSON.stringify({ teamName, expectedVersion: team.version }) });
export const deleteTeam = (organizationId: string, team: ServerTeam) =>
  apiJson("enrollment", orgPath(organizationId, `/teams/${encodeURIComponent(team.teamId)}`), z.undefined(), { method: "DELETE", headers: { "If-Match": `"team-${team.version}"` } });
