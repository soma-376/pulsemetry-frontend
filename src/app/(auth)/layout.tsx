/**
 * 인증 셸 — 로그인·IdP 이동처럼 세션이 아직 없는 화면들이 씁니다.
 * 사이드바도 필터도 없습니다. 가운데 카드 하나가 전부인 화면들만 여기 들어옵니다.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-[18px] bg-bg px-5 py-8 text-text">
      {children}
    </div>
  );
}
