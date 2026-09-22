"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ROLE_HINT, ROLE_LABEL, TEAM_OPTIONS } from "@/lib/metrics/members";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Override = { team?: string; role?: string };

/**
 * 구성원 초대.
 *
 * 사내 계정은 SSO 자동 프로비저닝으로 생성되므로 이 창의 실제 용도는 외부 협력사입니다.
 * 여러 명을 한 번에 넣을 수 있고, 두 명 이상이면 기본 배정 아래에서 개별로 바꿉니다 —
 * 한 명씩 초대하며 매번 팀을 고르는 것보다 빠릅니다.
 */
export function InviteModal({
  open,
  onClose,
  seatStatus,
}: {
  open: boolean;
  onClose: () => void;
  seatStatus: string;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [team, setTeam] = useState("");
  const [role, setRole] = useState("member");
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [sent, setSent] = useState<string | null>(null);

  const invalid = draft.trim().length > 0 && !EMAIL.test(draft.trim());
  const multi = emails.length > 1;

  const commit = () => {
    const value = draft.trim();
    if (!EMAIL.test(value)) return;
    setEmails((list) => (list.includes(value) ? list : [...list, value]));
    setDraft("");
  };

  const remove = (email: string) =>
    setEmails((list) => list.filter((x) => x !== email));

  const setOverride = (email: string, key: keyof Override, value: string) =>
    setOverrides((prev) => ({ ...prev, [email]: { ...prev[email], [key]: value } }));

  const send = () => {
    // 배정 요약을 만들어 "몇 명을 어디로 보냈는지"를 닫기 전에 확인시킵니다
    const byTeam: Record<string, number> = {};
    const roles = new Set<string>();
    for (const email of emails) {
      const t = overrides[email]?.team ?? team;
      const key = t || "팀 미배정";
      byTeam[key] = (byTeam[key] ?? 0) + 1;
      roles.add(ROLE_LABEL[overrides[email]?.role ?? role]);
    }
    const teamPart = Object.entries(byTeam)
      .map(([k, v]) => `${k} ${v}명`)
      .join(" · ");
    const rolePart = roles.size === 1 ? [...roles][0] : `역할 ${roles.size}종`;

    setSent(
      `${emails.length}명에게 초대 메일을 보냈습니다 — ${teamPart} · ${rolePart} · 7일 후 만료 · 수락 전에는 좌석을 차지하지 않습니다`,
    );
    setEmails([]);
    setDraft("");
    setOverrides({});
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="구성원 초대"
      subtitle={seatStatus}
      width={560}
      footer={
        <>
          <Button>CSV 업로드</Button>
          <div className="flex-1" />
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={emails.length === 0} onClick={send}>
            {emails.length ? `${emails.length}명 초대` : "초대"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">이메일</span>
          <div
            className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card p-1.5"
            style={{ borderColor: invalid ? "var(--red)" : "var(--border)" }}
          >
            {emails.map((email) => (
              <span
                key={email}
                className="flex items-center gap-1 rounded bg-sub px-2 py-1 text-[11.5px]"
              >
                {email}
                <button
                  type="button"
                  onClick={() => remove(email)}
                  aria-label={`${email} 제거`}
                  className="cursor-pointer text-text3 hover:text-text"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commit();
                }
              }}
              placeholder="name@codeworks.io"
              aria-label="초대할 이메일"
              className="h-7 min-w-40 flex-1 border-0 bg-transparent px-1 text-[12px] text-text outline-none placeholder:text-text3"
            />
          </div>
          <span
            className="text-[11px]"
            style={{ color: invalid ? "var(--red)" : "var(--text3)" }}
          >
            {invalid
              ? "이메일 형식이 아닙니다"
              : "Enter 또는 쉼표로 추가 · 여러 명 가능"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] font-medium">
              {multi ? "기본 배정" : "배정"}
            </span>
            {multi && (
              <span className="text-[11px] text-text3">
                아래 목록에서 개별 변경 가능
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              aria-label="팀"
            >
              <option value="">팀 미배정</option>
              {TEAM_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="역할"
            >
              <option value="member">구성원</option>
              <option value="lead">팀 리드 (자기 팀만)</option>
              <option value="viewer">조회 전용</option>
              <option value="admin">관리자</option>
            </Select>
          </div>
          <span className="pretty text-[11px] text-text3">{ROLE_HINT[role]}</span>

          {multi && (
            <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-2">
              {emails.map((email) => (
                <div key={email} className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 basis-40 overflow-hidden text-[11.5px] text-ellipsis whitespace-nowrap">
                    {email}
                  </span>
                  <Select
                    value={overrides[email]?.team ?? team}
                    onChange={(e) => setOverride(email, "team", e.target.value)}
                    aria-label={`${email} 팀`}
                    className="h-7"
                  >
                    <option value="">팀 미배정</option>
                    {TEAM_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={overrides[email]?.role ?? role}
                    onChange={(e) => setOverride(email, "role", e.target.value)}
                    aria-label={`${email} 역할`}
                    className="h-7"
                  >
                    <option value="member">구성원</option>
                    <option value="lead">팀 리드</option>
                    <option value="viewer">조회 전용</option>
                    <option value="admin">관리자</option>
                  </Select>
                  <button
                    type="button"
                    onClick={() => remove(email)}
                    aria-label={`${email} 제거`}
                    className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-border text-text2 hover:bg-hover"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {sent && (
          <div
            role="status"
            className="pretty rounded-md border border-border bg-sub px-3 py-2.5 text-[11.5px] text-text2"
          >
            {sent}
          </div>
        )}

        <p className="pretty rounded-md bg-sub px-3 py-2.5 text-[11.5px] text-text2">
          SSO 자동 프로비저닝이 켜져 있습니다 — 사내 계정은 초대 없이 첫 로그인 시
          생성됩니다. 외부 협력사만 여기서 초대하세요.
        </p>
      </div>
    </Modal>
  );
}
