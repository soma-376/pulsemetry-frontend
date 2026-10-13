import {
  Skeleton,
  SkeletonChart,
  SkeletonMetric,
  SkeletonPanel,
  SkeletonRegion,
  SkeletonRows,
} from "@/components/ui/Skeleton";

export function OverviewSkeleton() {
  return (
    <SkeletonRegion message="개요 데이터를 불러오는 중입니다…">
      <div className="grid grid-cols-5 gap-4 @max-[1023px]:grid-cols-2 @max-[560px]:grid-cols-1">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonMetric key={index} />
        ))}
        <SkeletonPanel className="col-span-3 @max-[1023px]:col-span-full">
          <SkeletonChart />
        </SkeletonPanel>
        <SkeletonPanel className="col-span-2 @max-[1023px]:col-span-full">
          <Skeleton className="mb-5 h-3 w-24" />
          <div className="grid grid-cols-[168px_minmax(0,1fr)] items-center gap-5 @max-[720px]:grid-cols-1">
            <div className="size-[168px] justify-self-center rounded-full border-[28px] border-border motion-safe:animate-pulse" />
            <SkeletonRows />
          </div>
        </SkeletonPanel>
        <SkeletonPanel className="col-span-full">
          <Skeleton className="mb-4 h-3 w-24" />
          <SkeletonRows rows={3} />
        </SkeletonPanel>
      </div>
    </SkeletonRegion>
  );
}
