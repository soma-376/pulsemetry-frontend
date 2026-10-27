"use client";

import { RenderErrorState } from "@/components/ui/RenderErrorState";

export default function Error({ retry }: { retry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 py-12 text-text">
      <div className="w-full max-w-lg">
        <RenderErrorState retry={retry} />
      </div>
    </main>
  );
}
