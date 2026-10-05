import { z } from "zod";

/** 초대와 편집에서 지정할 수 있는 역할. 서버의 owner는 지정할 수 없다. */
export const memberRoleSchema = z.enum(["member", "admin"], {
  error: "역할을 선택하세요",
});

export type MemberRole = z.infer<typeof memberRoleSchema>;
