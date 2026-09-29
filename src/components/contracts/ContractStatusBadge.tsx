import { CONTRACT_STATUS, type ContractStatus } from "@/lib/contract-status";

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const presentation = CONTRACT_STATUS[status];
  return <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: presentation.color }}>
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{presentation.label}
  </span>;
}
