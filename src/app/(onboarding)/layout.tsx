import { AuthGate } from "@/components/auth/AuthGate";
import { MotionProvider } from "@/components/ui/MotionProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate onboarding><MotionProvider>{children}</MotionProvider></AuthGate>;
}
