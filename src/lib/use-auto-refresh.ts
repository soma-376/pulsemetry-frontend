"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "pulsemetry.autoRefresh";
const CHANGE_EVENT = "pulsemetry:autorefreshchange";
let selected: boolean | undefined;

function getSnapshot(): boolean {
  if (selected === undefined) {
    try {
      selected = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      selected = false;
    }
  }
  return selected;
}

const getServerSnapshot = () => false;

function subscribe(onChange: () => void) {
  const syncStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    if (event.storageArea !== localStorage) return;
    selected = undefined;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", syncStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", syncStorage);
  };
}

function toggleAutoRefresh() {
  selected = !getSnapshot();
  try {
    localStorage.setItem(STORAGE_KEY, String(selected));
  } catch {
    // 저장소를 사용할 수 없어도 현재 탭에서는 선택한 상태로 동작한다.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAutoRefresh() {
  const autoRefresh = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { autoRefresh, toggleAutoRefresh };
}
