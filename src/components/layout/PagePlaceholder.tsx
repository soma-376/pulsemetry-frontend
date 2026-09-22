import { ButtonLink } from "@/components/ui/Button";

/**
 * 아직 이식하지 않은 페이지.
 * 사이드바 링크가 404 로 죽지 않게 자리를 잡아둡니다 — 껍데기를 만드는 게 목적이 아니라
 * 셸과 내비게이션을 개요 하나로 검증할 수 있게 하는 게 목적입니다.
 */
export function PagePlaceholder({
  title,
  source,
  note,
}: {
  title: string;
  /** 대응하는 디자인 원본 파일 */
  source: string;
  note: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 pt-5 pb-10">
      <h1 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h1>

      <div className="flex max-w-[640px] flex-col gap-4 rounded-lg border border-border bg-card p-[22px]">
        <div className="flex flex-col gap-[5px]">
          <span className="text-[14px] font-semibold">아직 구현 전입니다</span>
          <span className="pretty text-[12.5px] text-text2">{note}</span>
        </div>
        <div className="rounded-md border border-border bg-sub px-3 py-2.5">
          <span className="font-mono text-[11.5px] text-text2">{source}</span>
        </div>
        <div>
          <ButtonLink href="/overview">개요로 돌아가기</ButtonLink>
        </div>
      </div>
    </div>
  );
}
