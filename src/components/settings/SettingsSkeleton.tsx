import {
  Skeleton,
  SkeletonMetric,
  SkeletonPanel,
  SkeletonRegion,
  SkeletonRows,
} from "@/components/ui/Skeleton";

export function SettingsSkeleton() {
  return (
    <SkeletonRegion message="설정을 불러오는 중입니다…">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonMetric key={index} compact />
            ))}
          </div>
          <SkeletonPanel>
            <SkeletonRows rows={4} />
            <Skeleton className="mt-3 h-8 w-24" />
          </SkeletonPanel>
        </div>
        {[5, 3].map((rows) => (
          <div key={rows} className="flex flex-col gap-4">
            <Skeleton className="h-4 w-24" />
            <SkeletonPanel>
              <SkeletonRows rows={rows} />
            </SkeletonPanel>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
