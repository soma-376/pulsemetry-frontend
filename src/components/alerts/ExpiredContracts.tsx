import Link from "next/link";
import type { ExpiredContract } from "@/lib/api/contract-input";

/** 계약 갱신으로 해소하는 현재 상태이며 알림 확인 원장에는 기록하지 않는다. */
export function ExpiredContracts({
  contracts,
  onNavigate,
}: {
  contracts: ExpiredContract[];
  onNavigate: () => void;
}) {
  if (!contracts.length) return null;
  return (
    <section aria-label="만료된 계약" className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">만료된 계약이 있습니다</h3>
      <ul aria-label="만료된 계약 목록" className="flex flex-col gap-2">
        {contracts.map((contract) => (
          <li
            key={contract.vendorId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-xs"
          >
            <div className="min-w-0 flex-1 basis-36 break-words [overflow-wrap:anywhere]">
              <p className="font-semibold">{contract.displayName}</p>
              <p className="mt-1 text-text2">
                계약 만료 ·{" "}
                <time dateTime={contract.endDate}>{contract.endDate}</time>
              </p>
            </div>
            <Link
              href={`/settings?vendor=${encodeURIComponent(contract.vendorId)}`}
              onNavigate={onNavigate}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 font-medium text-text hover:bg-hover"
            >
              계약 갱신
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
