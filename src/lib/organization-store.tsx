"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { INITIAL_ORGANIZATION } from "@/mocks/organization";
import type { OrganizationState } from "./organization";

type Store = { state: OrganizationState; update: (change: (previous: OrganizationState) => OrganizationState) => void };
const OrganizationContext = createContext<Store | null>(null);

/** 루트 레이아웃에서 유지되는 메모리 목 상태. 새로고침하면 시드로 돌아갑니다. */
export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrganizationState>(() => structuredClone(INITIAL_ORGANIZATION));
  const update = useCallback<Store["update"]>((change) => setState(change), []);
  const store = useMemo(() => ({ state, update }), [state, update]);
  return <OrganizationContext.Provider value={store}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error("OrganizationProvider가 필요합니다");
  return context;
}
