import {
  Skeleton,
  SkeletonRegion,
  SkeletonRows,
} from "@/components/ui/Skeleton";

/** 계약 편집 폼의 이름·제품·플랜·기간·좌석 필드와 관측 요약을 본뜬 로딩 화면. */
export function VendorContractSkeleton() {
  return (
    <SkeletonRegion message="계약 정보를 불러오는 중입니다…">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-3 w-52" />
        </div>
        {["name", "product", "plan"].map((field) => (
          <div key={field} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="rounded-md border border-border p-3">
          <Skeleton className="mb-2 h-3 w-24" />
          <SkeletonRows rows={2} />
        </div>
        <div className="rounded-md border border-border bg-sub p-3">
          <Skeleton className="mb-2 h-3 w-20" />
          <SkeletonRows rows={3} />
        </div>
      </div>
    </SkeletonRegion>
  );
}
