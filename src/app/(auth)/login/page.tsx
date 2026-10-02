import type { Metadata } from "next";
import { LoginCard } from "@/components/auth/LoginCard";

export const metadata: Metadata = {
  title: "로그인 · Pulsemetry",
};

export default function LoginPage() {
  // 데모 시나리오는 목 모드에서만 보인다(playwright.mock.config.ts 가 켠다). 실서버·운영에서는 끈다.
  return <LoginCard demo={process.env.NEXT_PUBLIC_DEMO_LOGIN === "true"} />;
}
