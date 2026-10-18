"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { INITIAL_ORGANIZATION } from "@/mocks/organization";
import type { OrganizationState } from "./organization";
import { subscribeBackendIdentityChange } from "./api/session";

type Store = {
  state: OrganizationState;
  update: (change: (previous: OrganizationState) => OrganizationState) => void;
  reset: () => void;
};
const OrganizationContext = createContext<Store | null>(null);

/** 루트 레이아웃의 메모리 초안. 새로고침·계정 변경 시 이전 입력을 폐기한다. */
export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrganizationState>(() =>
    structuredClone(INITIAL_ORGANIZATION),
  );
  const update = useCallback<Store["update"]>((change) => setState(change), []);
  const reset = useCallback(
    () => setState(structuredClone(INITIAL_ORGANIZATION)),
    [],
  );
  useEffect(() => subscribeBackendIdentityChange(reset), [reset]);
  const store = useMemo(
    () => ({ state, update, reset }),
    [state, update, reset],
  );
  return (
    <OrganizationContext.Provider value={store}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error("OrganizationProvider가 필요합니다");
  return context;
}
