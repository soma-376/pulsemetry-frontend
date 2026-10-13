import {
  Skeleton,
  SkeletonMetric,
  SkeletonPanel,
  SkeletonRegion,
  SkeletonRows,
} from "@/components/ui/Skeleton";

export function MembersSkeleton() {
  return (
    <SkeletonRegion message="구성원을 불러오는 중입니다…">
      <div className="grid grid-cols-4 gap-4 @max-[1180px]:grid-cols-2 @max-[620px]:grid-cols-1">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonMetric key={index} />
        ))}
        <SkeletonPanel className="col-span-full">
          <Skeleton className="mb-4 h-3 w-24" />
          <SkeletonRows rows={2} />
        </SkeletonPanel>
        {Array.from({ length: 2 }, (_, index) => (
          <SkeletonPanel
            key={index}
            className="col-span-2 @max-[1180px]:col-span-full"
          >
            <Skeleton className="mb-4 h-3 w-32" />
            <SkeletonRows rows={3} />
          </SkeletonPanel>
        ))}
        <SkeletonPanel className="col-span-full">
          <div className="mb-4 flex flex-wrap justify-between gap-4">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-8 w-56" />
          </div>
          <SkeletonRows rows={6} />
        </SkeletonPanel>
      </div>
    </SkeletonRegion>
  );
}
