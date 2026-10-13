"use client";

import { contractInputText } from "@/lib/api/contract-input";
import { ContractStatusBadge } from "@/components/contracts/ContractStatusBadge";
import { contractAmountLabel } from "@/lib/contract-status";
import { useRef, useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { ContractForm } from "./ContractForm";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { VendorContractSkeleton } from "./VendorContractSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDrawer } from "@/components/ui/DetailDrawer";
import { NEW_CONTRACT_ROW } from "@/lib/contracts";
import { currentDateIso } from "@/lib/date";
import { int, usd } from "@/lib/format";
import { type VendorDraft } from "@/lib/settings";
import {
  serverVendorSchema,
  validateServerTiers,
} from "@/lib/schemas/server-contract";
import {
  settingsVendorDraft,
  settingsVendorDetailRow,
} from "@/lib/settings-vendors";
import { catalogOptions, plansOptions } from "@/lib/api/vendor-catalog";
import {
  apiJson,
  createCommands,
  ManagementError,
  orgPath,
} from "@/lib/api/management";
import {
  fetchSettingsVendor,
  settingsVendorOptions,
  settingsVendorResponseSchema,
  type SettingsVendor,
} from "@/lib/api/settings";
import { organizationKey } from "@/lib/api/query-keys";

type EditorProps = {
  organizationId: string;
  initial: SettingsVendor | null;
  registeredKinds: string[];
  editable: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onAccessDenied: (error: Error) => void;
};
const editorMutationKey = (org: string, id: string | null) =>
  ["vendor-contract-editor", org, id] as const;

/** 드로어는 조회 전부터 유지하고, 편집기는 최초 상세 응답이 준비된 뒤 한 번 초기화한다. */
export function ServerVendorDrawer({
  vendorId,
  vendorName,
  open,
  onAfterClose,
  ...props
}: Omit<EditorProps, "initial"> & {
  vendorId: string | null;
  vendorName?: string;
  open: boolean;
  onAfterClose: () => void;
}) {
  const query = useQuery({
    ...settingsVendorOptions(props.organizationId, vendorId),
    enabled: (query) => !!vendorId && open && query.state.data === undefined,
    gcTime: 0,
  });
  const busy =
    useIsMutating({
      mutationKey: editorMutationKey(props.organizationId, vendorId),
    }) > 0;
  const close = () => {
    if (!busy) props.onClose();
  };
  const title = vendorId
    ? `${vendorName ?? query.data?.displayName ?? "벤더"} 계약 설정`
    : "벤더 추가";
  const denied =
    query.error instanceof ManagementError &&
    [401, 403].includes(query.error.status);
  const ready = !vendorId || (!!query.data && !denied);
  return (
    <DetailDrawer
      open={open}
      onClose={close}
      onAfterClose={onAfterClose}
      title={title}
      subtitle="계약 정보와 좌석을 확인하고 수정합니다"
      footer={null}
      bodyClassName="flex min-h-0 flex-1 flex-col"
    >
      {ready ? (
        <VendorContractEditor
          {...props}
          initial={vendorId ? query.data! : null}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {query.isError ? (
              <ErrorState
                message={query.error.message}
                description={`${vendorName ?? "벤더"} 계약 정보를 불러오지 못했습니다.`}
                retryLabel="상세 다시 조회"
                retrying={query.isFetching}
                onRetry={() => void query.refetch({ cancelRefetch: false })}
              />
            ) : query.fetchStatus === "paused" ? (
              <EmptyState
                message="연결을 기다리고 있습니다"
                description="네트워크가 연결되면 계약 정보를 불러옵니다."
              />
            ) : (
              <VendorContractSkeleton />
            )}
          </div>
          <div className="flex shrink-0 justify-end border-t border-border px-6 py-3">
            <Button onClick={close}>닫기</Button>
          </div>
        </>
      )}
    </DetailDrawer>
  );
}

function VendorContractEditor({
  organizationId,
  initial,
  registeredKinds,
  editable,
  onClose,
  onSaved,
  onAccessDenied,
}: EditorProps) {
  const client = useQueryClient();
  const [current, setCurrent] = useState(initial);
  const [draft, setDraft] = useState<VendorDraft>(() =>
    settingsVendorDraft(initial ?? undefined),
  );
  const [confirm, setConfirm] = useState<"vendor" | "contract" | null>(null);
  const [post] = useState(createCommands);
  const inFlight = useRef(false);
  const catalog = useQuery(catalogOptions(organizationId));
  const plans = useQuery(
    plansOptions(
      organizationId,
      draft.kind ?? "",
      catalog.data?.catalogVersion,
    ),
  );
  const product = catalog.data?.items.find((item) => item.id === draft.kind);
  const options = current
    ? (catalog.data?.items ?? [])
    : (catalog.data?.items ?? []).filter(
        (item) => !registeredKinds.includes(item.id),
      );
  const baseline = settingsVendorDraft(current ?? undefined);
  const changed = JSON.stringify(draft) !== JSON.stringify(baseline);
  const validation = serverVendorSchema(
    product,
    plans.data?.plans ?? [],
    currentDateIso(),
    current?.contract ?? undefined,
  ).safeParse(draft);
  const missingInput = [
    ...(!draft.plan ? ["planId"] : []),
    ...(!draft.tiers?.length || draft.tiers.some((t) => !t.seats.trim())
      ? ["seats"]
      : []),
    ...(!draft.tiers?.length || draft.tiers.some((t) => !t.fee.trim())
      ? ["monthlyFeePerSeatUsd"]
      : []),
  ];
  const clearing = !!current?.contract && !draft.plan;
  const summary = validateServerTiers(
    draft.tiers ?? [],
    product?.allowsSeatTiers ?? false,
  );
  const row = current
    ? settingsVendorDetailRow(current, product)
    : NEW_CONTRACT_ROW;
  // 지운 제품의 조회(상세·좌석)는 다시 읽지 않는다 — 서버에 없는 제품이라 404 다. 창이 닫히면 버려진다.
  const refresh = (removed?: string) =>
    client.invalidateQueries({
      queryKey: organizationKey(organizationId),
      predicate: (query) => !removed || !query.queryKey.includes(removed),
    });
  const mutation = useMutation({
    mutationKey: editorMutationKey(organizationId, initial?.vendorId ?? null),
    retry: false,
    mutationFn: async (action: "save" | "vendor" | "contract") => {
      if (action !== "save") {
        if (!current) throw new Error("등록한 제품을 확인하세요.");
        await apiJson(
          "enrollment",
          orgPath(
            organizationId,
            `/vendors/${current.vendorId}${action === "contract" ? "/contract" : ""}`,
          ),
          z.undefined(),
          {
            method: "DELETE",
            headers: { "If-Match": `"vendor-${current.version}"` },
          },
        );
        return action === "contract"
          ? "계약 정보를 비웠습니다."
          : "벤더를 삭제했습니다.";
      }
      if (!validation.success || clearing)
        throw new Error("입력한 계약 정보를 확인하세요.");
      const body = validation.data;
      if (!current) {
        await post(
          organizationId,
          "/vendors",
          body,
          settingsVendorResponseSchema,
        );
      } else {
        // 이름만 바뀌면 계약을 재작성하지 않는다. 계약 없는 제품도 같은 PATCH를 사용한다.
        const nameOnly =
          JSON.stringify({ ...draft, name: baseline.name }) ===
          JSON.stringify(baseline);
        const contract = body.contract;
        await apiJson(
          "enrollment",
          orgPath(
            organizationId,
            `/vendors/${current.vendorId}${contract && !nameOnly ? "/contract" : ""}`,
          ),
          settingsVendorResponseSchema,
          {
            method: contract && !nameOnly ? "PUT" : "PATCH",
            body: JSON.stringify({
              expectedVersion: current.version,
              displayName: body.displayName,
              ...(contract && !nameOnly ? { contract } : {}),
            }),
          },
        );
      }
      return current ? "변경사항을 저장했습니다." : "벤더를 추가했습니다.";
    },
    onSuccess: (message, action) => {
      onSaved(message);
      onClose();
      void refresh(action === "vendor" ? current?.vendorId : undefined);
    },
    onError: (error) => {
      if (error instanceof ManagementError && [401, 403].includes(error.status))
        onAccessDenied(error);
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const reload = useMutation({
    mutationKey: editorMutationKey(organizationId, initial?.vendorId ?? null),
    mutationFn: async () => {
      if (!current) return;
      const latest = await fetchSettingsVendor(
        organizationId,
        current.vendorId,
      );
      setCurrent(latest);
      setDraft(settingsVendorDraft(latest));
      setConfirm(null);
      mutation.reset();
    },
    onError: (error) => {
      if (error instanceof ManagementError && [401, 403].includes(error.status))
        onAccessDenied(error);
    },
  });
  const busy = mutation.isPending || reload.isPending;
  const conflict =
    mutation.error instanceof ManagementError &&
    mutation.error.code === "version_conflict";
  const restricted =
    mutation.error instanceof ManagementError &&
    [401, 403].includes(mutation.error.status);
  const submit = (action: "save" | "vendor" | "contract") => {
    if (inFlight.current || busy || !editable || restricted || conflict) return;
    inFlight.current = true;
    mutation.mutate(action);
  };
  const errors = [
    catalog.error,
    plans.error,
    mutation.error,
    reload.error,
  ].filter(Boolean);
  const disabled =
    !editable ||
    busy ||
    restricted ||
    conflict ||
    !validation.success ||
    clearing ||
    (!current && registeredKinds.includes(draft.kind ?? "")) ||
    !changed ||
    catalog.isPending ||
    catalog.isError ||
    (!!draft.plan && (plans.isFetching || plans.isError));
  const footer = (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-text2">
          {changed
            ? "입력한 월 계약액"
            : current
              ? contractAmountLabel(current.contractStatus)
              : "월 계약액"}
        </span>
        <strong className="tnum text-[15px]">
          {draft.plan && summary.tiers ? usd(summary.spend) : "-"}
        </strong>
      </div>
      {confirm && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-red bg-red-tint px-3 py-2.5"
        >
          <span className="flex-1 text-xs">
            {confirm === "contract"
              ? "계약 정보만 비웁니다. 등록한 제품은 유지됩니다."
              : "등록한 제품을 삭제합니다. 이전 변경 이력은 보존됩니다."}
          </span>
          <Button size="sm" disabled={busy} onClick={() => setConfirm(null)}>
            되돌리기
          </Button>
          <Button
            size="sm"
            loading={mutation.isPending && mutation.variables === confirm}
            loadingLabel={confirm === "contract" ? "비우는 중…" : "삭제 중…"}
            disabled={busy || conflict || restricted}
            onClick={() => submit(confirm)}
          >
            {confirm === "contract" ? "계약 비우기 확인" : "제품 삭제 확인"}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {current && (
          <Button
            disabled={!editable || busy || conflict || restricted}
            onClick={() => setConfirm("vendor")}
            className="text-red"
          >
            벤더 삭제
          </Button>
        )}
        {current?.contract && (
          <Button
            disabled={!editable || busy || conflict || restricted}
            onClick={() => setConfirm("contract")}
          >
            계약 비우기
          </Button>
        )}
        <div className="flex-1" />
        <Button disabled={busy} onClick={onClose}>
          취소
        </Button>
        <Button
          variant="primary"
          loading={mutation.isPending && mutation.variables === "save"}
          loadingLabel="저장 중…"
          disabled={disabled}
          onClick={() => submit("save")}
        >
          {current ? "변경사항 저장" : "벤더 추가"}
        </Button>
      </div>
    </div>
  );
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        {current && (
          <div className="flex flex-col gap-2">
            <ContractStatusBadge status={current.contractStatus} />
            {current.contractInput?.status === "required" && (
              <p role="status" className="text-xs text-orange-ink">
                {missingInput.length
                  ? contractInputText(missingInput)
                  : "필수 항목을 입력했습니다. 저장하면 계약 입력이 완료됩니다."}
              </p>
            )}
            {current.contract && (
              <p className="text-xs text-text3">
                계약 기간 {current.contract.effectiveFrom} ~{" "}
                {current.contract.effectiveTo ?? "종료일 미지정"}
              </p>
            )}
            {current.contractStatus === "expired" && (
              <p className="text-xs text-text3">
                마지막 계약 정보입니다. 갱신 여부를 확인해 주세요.
              </p>
            )}
          </div>
        )}
        {errors.length > 0 && (
          <ErrorState
            message={
              <>
                {errors.map((error, index) => (
                  <p key={index}>{error!.message}</p>
                ))}
              </>
            }
          >
            {conflict ? (
              <Button
                size="sm"
                loading={reload.isPending}
                loadingLabel="불러오는 중…"
                disabled={busy}
                onClick={() => reload.mutate()}
              >
                입력 취소 후 최신 내용 불러오기
              </Button>
            ) : (
              (catalog.isError || plans.isError) && (
                <Button
                  size="sm"
                  onClick={() => {
                    void catalog.refetch();
                    if (draft.kind) void plans.refetch();
                  }}
                >
                  다시 조회
                </Button>
              )
            )}
          </ErrorState>
        )}
        {!restricted && (
          <>
            <fieldset
              disabled={!editable || busy || conflict}
              className="min-w-0"
            >
              <ContractForm
                row={row}
                isNew={!current}
                draft={draft}
                existingContract={current?.contract ?? undefined}
                catalog={{
                  vendors: options,
                  plans: plans.data?.plans ?? [],
                  loading: plans.isFetching,
                }}
                onChange={(patch) => {
                  setDraft((previous) => ({ ...previous, ...patch }));
                  mutation.reset();
                  setConfirm(null);
                }}
              />
            </fieldset>
            {clearing && (
              <p role="alert" className="text-xs text-red">
                기존 계약을 없애려면 하단의 계약 비우기를 사용하세요.
              </p>
            )}
            {!validation.success && draft.kind && (
              <ul className="text-xs text-red">
                {[
                  ...new Set(
                    validation.error.issues.map((issue) => issue.message),
                  ),
                ].map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
            {current && (
              <section className="flex flex-col gap-2 rounded-md border border-border bg-sub p-3">
                <span className="text-xs font-semibold">신호에서 측정</span>
                {[
                  { label: "활성 사용자 (7일)", value: current.activeUsers7d },
                  { label: "30일 누적 사용자", value: current.activeUsers30d },
                ].map((fact) => (
                  <div
                    key={fact.label}
                    className="flex justify-between text-xs"
                  >
                    <span className="text-text3">{fact.label}</span>
                    <span>
                      {fact.value == null ? "-" : `${int(fact.value)}명`}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-xs">
                  <span className="text-text3">배정 좌석(좌석 원장)</span>
                  <span>
                    {!current.seats?.data
                      ? "-"
                      : `${int(current.seats.data.assigned)}석${current.seats.data.contracted === null ? "" : ` / 계약 ${int(current.seats.data.contracted)}석`}`}
                  </span>
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <footer className="shrink-0 border-t border-border px-6 py-3">
        {footer}
      </footer>
    </>
  );
}
