"use client";

import type { ReactNode } from "react";
import { FiltersProvider } from "@/lib/filters";

export function OverviewProviders({ todayIso, children }: { todayIso: string; children: ReactNode }) {
  return <FiltersProvider todayIso={todayIso}>{children}</FiltersProvider>;
}
