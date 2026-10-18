"use client";

import { useQuery } from "@tanstack/react-query";
import { settingsOptions } from "@/lib/api/settings";

export function usePlannedVendors(organizationId: string, enabled: boolean) {
  return useQuery({
    ...settingsOptions(organizationId),
    enabled: !!organizationId && enabled,
  });
}
