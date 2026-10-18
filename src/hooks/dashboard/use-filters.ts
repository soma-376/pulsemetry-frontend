"use client";

import { useContext } from "react";
import { FiltersContext } from "@/lib/filters";

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within <FiltersProvider>");
  return ctx;
}
