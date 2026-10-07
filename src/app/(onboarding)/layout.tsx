import { RouteGuard } from "@/components/auth/RouteGuard";
import { MotionProvider } from "@/components/ui/MotionProvider";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard>
      <MotionProvider>{children}</MotionProvider>
    </RouteGuard>
  );
}
