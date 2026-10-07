import { redirect } from "next/navigation";

/**
 * 루트는 자체 화면을 갖지 않습니다.
 * 세션 연동이 붙으면 여기서 로그인 여부를 보고 /login 과 /overview 로 갈라집니다.
 */
export default function RootPage() {
  redirect("/overview");
}
