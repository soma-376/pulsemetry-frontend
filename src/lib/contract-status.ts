import { z } from "zod";

export const contractStatusSchema = z.enum(["missing", "scheduled", "active", "expired"]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;
