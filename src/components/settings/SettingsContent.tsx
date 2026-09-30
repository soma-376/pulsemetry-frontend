"use client";

import { contractSummaryNotice } from "@/lib/contract-status";
import { PageContainer } from "@/components/layout/PageContainer";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardPageRefresh } from "@/components/layout/DashboardHeader";
import { SettingRow, SettingSection } from "./SettingRow";
import { VendorTable } from "./VendorTable";
import { ServerVendorDrawer } from "./ServerVendorDrawer";
import { InstallationsModal } from "./InstallationsModal";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { Toast, useToast } from "@/components/ui/Toast";
import { Toggle } from "@/components/ui/Toggle";
import { useBackendSession } from "@/lib/api/session";
import { apiJson, ManagementError, orgPath, policySavedSchema } from "@/lib/api/management";
import { settingsOptions, settingsVendorOptions } from "@/lib/api/settings";
import { operationOptions } from "@/lib/api/operations";
import { cleanupView, isShortening, retentionBoundary, retentionLabel, seoulToday } from "@/lib/policy-settings";
import { catalogOptions } from "@/lib/api/vendor-catalog";
import { organizationKey } from "@/lib/api/query-keys";
import { settingsVendorRow } from "@/lib/settings-vendors";
import { useFilters } from "@/lib/filters";
import { int, usd } from "@/lib/format";

const number = (value: number | null | undefined) => value == null ? "-" : int(value);
const amount = (value: string | null | undefined) => value == null ? "-" : usd(Number(value));
const labels: Record<string, { title: string; note: string }> = {
  spend_spike: { title: "비용 급증 알림", note: "팀 사용량이 전주 대비 급증할 때" },
  quota_exceeded: { title: "한도 초과 알림", note: "좌석 한도에 걸려 요청이 차단될 때" },
  model_not_allowed: { title: "비허용 모델 호출 알림", note: "허용목록에 없는 모델이 호출될 때" },
  tool_unapproved: { title: "미승인 도구 연결 알림", note: "승인되지 않은 도구가 연결될 때" },
};

export function SettingsContent() {
  const session = useBackendSession();
  if (!session) return <div className="p-6 text-sm text-text2">설정을 조회하려면 <a href="/login" className="underline">로그인</a>해 주세요.</div>;
  return <OrganizationSettings key={session.user.organizationId} organizationId={session.user.organizationId} />;
}
function OrganizationSettings({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const { autoRefresh } = useFilters();
  const query = useQuery({ ...settingsOptions(organizationId), refetchInterval: autoRefresh ? 300_000 : false });
  const catalog = useQuery(catalogOptions(organizationId));
  const [editor, setEditor] = useState<{ vendorId: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const { toast, showToast, dismissToast } = useToast();
  const [accessError, setAccessError] = useState<Error | null>(null);
  const vendorQuery = useQuery({
    ...settingsVendorOptions(organizationId, editor?.vendorId ?? null),
    // 편집에 쓸 최초 응답만 조회한다. 편집 중 무효화로 폼을 교체하지 않는다.
    enabled: query => !!editor?.vendorId && open && query.state.data === undefined,
    // 닫고 다시 열면 최신 버전으로 편집을 시작한다.
    gcTime: 0,
  });
  const openingVendorId = vendorQuery.isFetching ? editor?.vendorId ?? null : null;
  const [policyChoice, setPolicyChoice] = useState<boolean | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const policy = useMutation({ retry: false, mutationFn: (collectRawContent: boolean) => apiJson("enrollment", orgPath(organizationId, "/collection-policy"), policySavedSchema, {
    method: "PUT", body: JSON.stringify({ expectedVersion: query.data!.collectionPolicy.version, collectRawContent }),
  }), onSuccess: () => { setPolicyChoice(null); showToast("수집 정책을 저장했습니다."); void client.invalidateQueries({ queryKey: organizationKey(organizationId) }); } });
  // 회수 기준·집계 보존은 manifest 판과 따로 저장하고 설정의 판으로 충돌을 막는다(백엔드 ADR 0046). 보낸 값만 바뀐다.
  const [retentionChoice, setRetentionChoice] = useState<{ next: number | null } | null>(null);
  const settingsSave = useMutation({ retry: false,
    mutationFn: (change: { reclaimIdleDays: number } | { aggregateRetentionMonths: number | null }) => apiJson("enrollment", orgPath(organizationId, "/collection-policy"), policySavedSchema, {
      method: "PUT", body: JSON.stringify({ expectedVersion: query.data!.collectionPolicy.version, expectedSettingsVersion: query.data!.collectionPolicy.settingsVersion, ...change }),
    }),
    onSuccess: saved => {
      setRetentionChoice(null);
      showToast(saved.cleanupOperationId ? "집계 보존을 저장했습니다. 정리 작업이 만들어졌습니다." : "정책을 저장했습니다.");
      void client.invalidateQueries({ queryKey: organizationKey(organizationId) });
    },
    // 다른 곳에서 먼저 바꿨으면 최신 값을 다시 읽는다. 입력은 서버 값으로 돌아간다.
    onError: error => { if (error instanceof ManagementError && error.code === "version_conflict") void query.refetch({ cancelRefetch: false }); },
  });
  const cleanupId = query.data?.collectionPolicy.cleanupOperationId ?? null;
  const cleanup = useQuery({ ...operationOptions(organizationId, cleanupId), enabled: !!cleanupId });
  const forbidden = [query.error, catalog.error, vendorQuery.error, accessError, policy.error, settingsSave.error].some(error => error instanceof ManagementError && [401, 403].includes(error.status));
  const data = forbidden ? undefined : query.data;
  const openVendor = (id: string) => {
    setAccessError(null);
    setEditor({ vendorId: id });
    setOpen(true);
  };
  const rollout = data?.policyRollout;
  const cards = [
    { label: "좌석 지출", value: amount(data?.summary.monthlySeatFeeUsd), caption: data?.summary.monthlySeatFeeUsd == null ? "유효 계약 금액 확인 불가" : "유효 계약 기준 월 합계" },
    { label: "종량 지출", value: amount(data?.summary.meteredMonthToDate.data?.actualBilledUsd), caption: "실제 청구액" },
    { label: "활성 좌석", value: `${number(data?.summary.activeSeats7d)} / ${number(data?.summary.contractedSeats)}`, caption: "활성 좌석 / 유효 계약 좌석" },
    { label: "미설정 벤더", value: data ? `${int(data.summary.unconfiguredVendors)}곳` : "-", caption: "계약 정보 확인 필요" },
  ];
  const rows = data?.vendors.items.map(vendor => settingsVendorRow(vendor, catalog.data?.items.find(product => product.id === vendor.kind))) ?? [];
  const contractNotice = data ? contractSummaryNotice(data.vendors.items) : null;
  const errors = [query.error, catalog.error, accessError].filter(Boolean);
  useDashboardPageRefresh(() => { setAccessError(null); void query.refetch({ cancelRefetch: false }); }, query.isFetching);
  return <>
    <Toast toast={toast} onDismiss={dismissToast} />
    <PageContainer className="flex flex-col gap-8 pt-5 pb-10">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h1 className="text-[18px] font-semibold tracking-[-0.01em]">설정</h1>
        {data && query.isFetching && <LoadingState variant="inline" message="설정을 새로고침하는 중입니다…" />}
      </div>
      {errors.length > 0 && <ErrorState
        message={<>{errors.map((error, index) => <p key={index}>{error!.message}</p>)}</>}
        retrying={query.isFetching || catalog.isFetching}
        onRetry={() => { setAccessError(null); void query.refetch({ cancelRefetch: false }); void catalog.refetch({ cancelRefetch: false }); }}
      />}
      {vendorQuery.error && <ErrorState message={vendorQuery.error.message} retryLabel="상세 다시 조회" retrying={vendorQuery.isFetching} onRetry={() => void vendorQuery.refetch({ cancelRefetch: false })} />}
      {!data && !forbidden && query.isPending && <LoadingState message="설정을 불러오는 중입니다…" className="min-h-[480px]" />}
      {data && <>
      <SettingSection id="vendors" title="벤더 연동">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">{cards.map(card => <StatCard key={card.label} {...card} size="sm" />)}</div>
        {contractNotice && <p className="text-xs text-text3">{contractNotice}</p>}
        <VendorTable rows={rows} loadingVendorId={openingVendorId} addDisabled={!data.capabilities.editContracts || catalog.isError || catalog.isPending || openingVendorId !== null || catalog.data?.items.every(product => data.vendors.items.some(vendor => vendor.kind === product.id))} onOpen={openVendor} onAdd={() => { setEditor({ vendorId: null }); setOpen(true); }} />
        {!rows.length && <EmptyState message="등록된 제품이 없습니다." />}
      </SettingSection>
        <SettingSection id="collection" title="수집 정책"><div className="rounded-lg border border-border bg-card">
          <SettingRow first title="수집 정책 버전" note={`적용 ${int(rollout!.appliedInstallations)}대 · 미적용 ${int(rollout!.outdatedInstallations)}대 · 확인 불가 ${int(rollout!.unknownInstallations)}대 · 설치 보고 기준`}>
            <div className="flex items-center gap-2"><span className="tnum text-xs">v{rollout!.desiredVersion}</span><Button size="sm" aria-label="정책 적용 현황 보기" onClick={() => setInstallOpen(true)}>{int(rollout!.appliedInstallations)} / {int(rollout!.eligibleInstallations)}대</Button></div>
          </SettingRow>
          <SettingRow title="프롬프트 원문 수집" note={data.collectionPolicy.collectRawContent ? "프롬프트와 응답 본문을 수집합니다" : "프롬프트와 응답 본문을 수집하지 않습니다"}>
            <Toggle on={data.collectionPolicy.collectRawContent} label="프롬프트 원문 수집" onColor="var(--red)" disabled={!data.capabilities.editCollectionPolicy || policy.isPending} onChange={() => { policy.reset(); setPolicyChoice(!data.collectionPolicy.collectRawContent); }} />
          </SettingRow>
          <SettingRow title="좌석 회수 기준" note={`${data.collectionPolicy.reclaimIdleDaysSource === "default" ? "서버 기본값 · " : ""}벤더별 배정·관측 정보가 확인된 좌석만 검토합니다 · 자동 회수 없음`}>
            <Select value={data.collectionPolicy.reclaimIdleDays} aria-label="좌석 회수 기준" disabled={!data.capabilities.editCollectionPolicy || settingsSave.isPending}
              onChange={event => { settingsSave.reset(); settingsSave.mutate({ reclaimIdleDays: Number(event.target.value) }); }}>
              {[...new Set([...data.collectionPolicy.options.reclaimIdleDays, data.collectionPolicy.reclaimIdleDays])].sort((a, b) => a - b).map(days => <option key={days} value={days}>{days}일</option>)}
            </Select>
          </SettingRow>
          <SettingRow title="집계 보존" note="팀·일·구성원 집계의 원천인 분석 원본을 보관하는 기간 · 줄이면 그 이전 기록을 지웁니다">
            <Select value={data.collectionPolicy.aggregateRetentionMonths ?? ""} aria-label="집계 보존" disabled={!data.capabilities.editCollectionPolicy || settingsSave.isPending}
              onChange={event => {
                const next = event.target.value === "" ? null : Number(event.target.value);
                settingsSave.reset();
                // 줄이면 되돌릴 수 없는 삭제로 이어진다 — 확인한 뒤에만 저장한다.
                if (isShortening(data.collectionPolicy.aggregateRetentionMonths, next)) setRetentionChoice({ next });
                else settingsSave.mutate({ aggregateRetentionMonths: next });
              }}>
              {data.collectionPolicy.options.aggregateRetentionMonths.map(months => <option key={months ?? "none"} value={months ?? ""}>{retentionLabel(months)}</option>)}
            </Select>
          </SettingRow>
          {cleanupId && <SettingRow title="보존 정리" note="가장 최근에 집계 보존을 줄인 저장의 정리 작업 · 보존 작업이 실행할 때 진행됩니다">
            <span role="status" aria-label="보존 정리 상태" className="max-w-[320px] text-right text-xs" style={{ color: cleanup.data && cleanupView(cleanup.data.operation).tone === "failed" ? "var(--red)" : "var(--text2)" }}>
              {cleanup.data ? cleanupView(cleanup.data.operation).text : cleanup.isError ? "정리 상태를 불러오지 못했습니다" : "정리 상태를 불러오는 중입니다…"}
            </span>
          </SettingRow>}
          {settingsSave.error && !retentionChoice && <div className="border-t border-border px-4 py-3"><ErrorState variant="inline" message={settingsSave.error.message} /></div>}
          <SettingRow title="마지막 수집" note="최근 신호 수신 시각"><span className="tnum text-xs">{data.ingest.lastReceivedAt ? new Date(data.ingest.lastReceivedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"}</span></SettingRow>
        </div></SettingSection>
        <SettingSection id="alerts" title="알림 규칙"><div className="rounded-lg border border-border bg-card">{data.alertRules.map((rule, index) => <SettingRow key={rule.ruleId} first={index === 0} title={labels[rule.ruleId]?.title ?? rule.ruleId} note={labels[rule.ruleId]?.note ?? ""}>
          <div className="flex items-center gap-3"><span className="tnum text-xs">{rule.threshold.unit === "ratio" ? `${Math.round(rule.threshold.value * 100)}%` : `${rule.threshold.value}${rule.threshold.unit === "users" ? "명" : "회"}`}</span><Toggle disabled on={rule.enabled} label={labels[rule.ruleId]?.title ?? rule.ruleId} onChange={() => {}} /></div>
        </SettingRow>)}</div></SettingSection>
      </>}
    </PageContainer>
    {data && editor && (!editor.vendorId || vendorQuery.data) && <ServerVendorDrawer key={editor.vendorId ?? "new"} organizationId={organizationId} initial={editor.vendorId ? vendorQuery.data! : null} registeredKinds={data.vendors.items.map(vendor => vendor.kind)} editable={data.capabilities.editContracts} open={open} onClose={() => setOpen(false)} onAfterClose={() => setEditor(null)} onSaved={showToast} onAccessDenied={setAccessError} />}
    <Modal open={policyChoice != null && !!data} onClose={() => { if (!policy.isPending) setPolicyChoice(null); }} title="수집 정책 변경" width={460} footer={<><div className="flex-1" /><Button disabled={policy.isPending} onClick={() => setPolicyChoice(null)}>취소</Button><Button variant="primary" loading={policy.isPending} loadingLabel="저장 중…" disabled={policyChoice == null} onClick={() => { if (policyChoice != null) policy.mutate(policyChoice); }}>변경사항 저장</Button></>}>
      <p className="text-xs text-text2">새로 등록하는 설치에 바로 적용됩니다. 이미 설치된 기기는 다음 보고 때 새 정책이 있다는 것을 알고, 사용자가 로그인한 기기가 스스로 받아 적용합니다. 서버가 원격으로 바꾸지는 않습니다.</p>
      <p className="text-xs text-text3">적용 여부는 수집 정책 버전의 적용 현황에서 확인합니다.</p>
      {policy.error && <ErrorState message={policy.error.message} />}
    </Modal>
    <Modal open={!!retentionChoice && !!data} onClose={() => { if (!settingsSave.isPending) setRetentionChoice(null); }} title="집계 보존 줄이기" width={480}
      footer={<><div className="flex-1" /><Button disabled={settingsSave.isPending} onClick={() => setRetentionChoice(null)}>취소</Button>
        <Button variant="danger" loading={settingsSave.isPending} loadingLabel="저장 중…" onClick={() => { if (retentionChoice) settingsSave.mutate({ aggregateRetentionMonths: retentionChoice.next }); }}>기록 삭제에 동의하고 저장</Button></>}>
      {data && retentionChoice?.next != null && <>
        <p className="text-xs text-text2">{retentionLabel(data.collectionPolicy.aggregateRetentionMonths)}에서 {retentionLabel(retentionChoice.next)}로 줄입니다.</p>
        <p className="text-xs text-text">저장하면 분석 원본(팀·일·구성원 집계의 원천)에서 <strong>{retentionBoundary(seoulToday(), retentionChoice.next)} 00:00(KST) 이전</strong> 기록을 지우는 정리 작업이 만들어집니다.
          지운 기록은 보존 기간을 다시 늘려도 돌아오지 않습니다.</p>
        <p className="text-xs text-text3">수신 기록과 수집 이력 요약은 지우지 않습니다. 정리는 보존 작업이 실행할 때 진행되고 상태는 이 화면의 &ldquo;보존 정리&rdquo;에서 확인합니다.</p>
      </>}
      {settingsSave.error && <ErrorState message={settingsSave.error.message} />}
    </Modal>
    {data && <InstallationsModal key={rollout!.desiredVersion} organizationId={organizationId} rollout={rollout!} channel={data.capabilities.notifyInstallations}
      open={installOpen} onClose={() => setInstallOpen(false)} />}
  </>;
}
