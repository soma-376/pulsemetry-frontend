import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { activeRun, scenarioApi, type Run, type RunInput } from '../../api/scenarios';
import { ApiError } from '../../api/client';
export type RunEntry = {
  run: Run;
  input?: RunInput;
  error?: string;
  busy?: boolean;
  revision: number;
  timer?: ReturnType<typeof setTimeout>;
  controller?: AbortController;
};
function useRunsState() {
  const entries = useRef(new Map<string, RunEntry>()),
    alive = useRef(true),
    submitting = useRef(false),
    startController = useRef<AbortController | null>(null);
  const [revision, render] = useState(0),
    [pending, setPending] = useState(false);
  const emit = () => {
    if (alive.current) render((v) => v + 1);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      startController.current?.abort();
      for (const r of entries.current.values()) {
        clearTimeout(r.timer);
        r.controller?.abort();
      }
      entries.current.clear();
    };
  }, []);
  function schedule(entry: RunEntry, delay: number) {
    clearTimeout(entry.timer);
    if (activeRun(entry.run))
      entry.timer = setTimeout(() => void refresh(entry.run.run_id!), delay);
  }
  async function refresh(id: string) {
    const e = entries.current.get(id);
    if (!e) return;
    clearTimeout(e.timer);
    e.controller?.abort();
    const version = ++e.revision;
    const controller = (e.controller = new AbortController());
    e.error = undefined;
    e.busy = true;
    emit();
    try {
      const response = await scenarioApi.get(id, controller.signal);
      if (!alive.current || e.revision !== version) return;
      e.run = response.run;
      schedule(e, response.retryMs);
    } catch (error) {
      if (!controller.signal.aborted) e.error = (error as Error).message;
    } finally {
      if (alive.current && e.revision === version) {
        e.busy = false;
        emit();
      }
    }
  }
  async function start(id: string, input: RunInput) {
    if (submitting.current) throw new Error('실행 요청을 처리 중입니다.');
    submitting.current = true;
    setPending(true);
    const controller = (startController.current = new AbortController());
    try {
      const response = await scenarioApi.start(id, input, controller.signal);
      if (!alive.current) throw new Error('로그인 세션이 종료되었습니다.');
      const entry: RunEntry = { run: response.run, input: structuredClone(input), revision: 0 };
      entries.current.set(response.run.run_id!, entry);
      schedule(entry, response.retryMs);
      emit();
      return response.run.run_id!;
    } finally {
      submitting.current = false;
      if (alive.current) setPending(false);
    }
  }
  async function cancel(id: string) {
    const e = entries.current.get(id);
    if (!e || e.busy || !activeRun(e.run)) return;
    clearTimeout(e.timer);
    e.controller?.abort();
    const version = ++e.revision;
    const controller = (e.controller = new AbortController());
    e.busy = true;
    e.error = undefined;
    emit();
    try {
      const response = await scenarioApi.cancel(id, controller.signal);
      if (!alive.current || e.revision !== version) return;
      e.run = response.run;
    } catch (error) {
      if (!controller.signal.aborted) {
        e.error = (error as Error).message;
        if (error instanceof ApiError && error.status === 409) {
          e.busy = false;
          void refresh(id);
          return;
        }
      }
    } finally {
      if (alive.current && e.revision === version) {
        e.busy = false;
        emit();
      }
    }
  }
  function accept(run: Run, retryMs = 2000) {
    const existing = entries.current.get(run.run_id!);
    if (existing) return;
    const entry: RunEntry = { run, revision: 0 };
    entries.current.set(run.run_id!, entry);
    schedule(entry, retryMs);
    emit();
  }
  function forget(id: string) {
    const entry = entries.current.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      entry.controller?.abort();
      entry.revision++;
    }
    entries.current.delete(id);
    emit();
  }
  return {
    accept,
    forget,
    entries: [...entries.current.values()].reverse(),
    revision,
    pending,
    start,
    cancel,
    refresh,
  };
}
const Context = createContext<ReturnType<typeof useRunsState> | null>(null);
export function RunProvider({ children }: { children: ReactNode }) {
  const state = useRunsState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useRuns() {
  const state = useContext(Context);
  if (!state) throw new Error('RunProvider missing');
  return state;
}
export const statusLabel: Record<string, string> = {
  queued: '대기',
  running: '실행 중',
  succeeded: '완료',
  failed: '실패',
  cancelled: '취소됨',
};
