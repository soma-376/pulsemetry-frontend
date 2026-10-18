"use client";

import { useContext } from "react";
import { FiltersContext } from "@/lib/filters";
import { withFilterQuery } from "@/lib/filter-query";

/** 전역 필터가 없는 독립 카드에서는 원래 링크를 사용한다. */
export function useDashboardHref() {
  const filters = useContext(FiltersContext);
  return (href: string) => (filters ? withFilterQuery(href, filters) : href);
}
