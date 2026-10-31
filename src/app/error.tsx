"use client";

import { useEffect } from "react";
import { reportBrowserError } from "@/lib/rum/client";

import { RenderErrorState } from "@/components/ui/RenderErrorState";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    void reportBrowserError(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 py-12 text-text">
      <div className="w-full max-w-lg">
        <RenderErrorState retry={retry} />
      </div>
    </main>
  );
}
