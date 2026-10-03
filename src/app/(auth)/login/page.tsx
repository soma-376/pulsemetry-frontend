import { RouteGuard } from "@/components/auth/RouteGuard";
import type { Metadata } from "next";
import { LoginCard } from "@/components/auth/LoginCard";

export const metadata: Metadata = {
  title: "로그인 · Pulsemetry",
};

export default function LoginPage() {
  return <RouteGuard><LoginCard /></RouteGuard>;
}
