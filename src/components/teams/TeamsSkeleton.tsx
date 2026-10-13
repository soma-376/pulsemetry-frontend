import {
  Skeleton,
  SkeletonChart,
  SkeletonPanel,
  SkeletonRegion,
  SkeletonRows,
} from "@/components/ui/Skeleton";

export function TeamsSkeleton() {
  return (
    <SkeletonRegion message="팀 분석을 불러오는 중입니다…">
      <div className="flex flex-col gap-4">
        <SkeletonPanel className="p-6">
          <Skeleton className="mb-5 h-8 w-64" />
          <SkeletonChart className="h-[196px]" />
          <SkeletonRows rows={3} />
        </SkeletonPanel>
        <div className="grid grid-cols-5 gap-4 @max-[1100px]:grid-cols-1">
          <SkeletonPanel className="col-span-2 @max-[1100px]:col-span-full">
            <SkeletonChart className="h-[206px]" />
          </SkeletonPanel>
          <SkeletonPanel className="col-span-3 @max-[1100px]:col-span-full">
            <SkeletonChart className="h-[226px]" />
          </SkeletonPanel>
        </div>
        <SkeletonPanel>
          <Skeleton className="mb-4 h-7 w-40" />
          <SkeletonRows rows={5} />
        </SkeletonPanel>
      </div>
    </SkeletonRegion>
  );
}
