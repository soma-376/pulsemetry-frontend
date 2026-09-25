import { MotionProvider } from "@/components/ui/MotionProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
