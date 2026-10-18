"use client";

import { useContext } from "react";
import { OrganizationContext } from "@/lib/organization-store";

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error("OrganizationProvider가 필요합니다");
  return context;
}
