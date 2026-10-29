import {
  Skeleton,
  SkeletonChart,
  SkeletonMetric,
  SkeletonPanel,
  SkeletonRegion,
} from "@/components/ui/Skeleton";

export function PerformanceSkeleton() {
  return (
    <SkeletonRegion message="성과를 불러오는 중입니다…">
      <div className="flex max-w-[1100px] flex-col gap-6">
        <SkeletonPanel className="p-5">
          <Skeleton className="mb-5 h-4 w-40" />
          <div className="grid grid-cols-3 gap-3">
            <SkeletonMetric />
            <SkeletonMetric />
            <SkeletonMetric />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <SkeletonMetric compact />
            <SkeletonMetric compact />
            <SkeletonMetric compact />
            <SkeletonMetric compact />
          </div>
        </SkeletonPanel>
        <SkeletonPanel className="p-5">
          <SkeletonChart className="h-[240px]" />
        </SkeletonPanel>
      </div>
    </SkeletonRegion>
  );
}
