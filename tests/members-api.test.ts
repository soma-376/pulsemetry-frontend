import { test } from "node:test";
import assert from "node:assert/strict";
import { ManagementError } from "../src/lib/api/management";
import { fetchWaitingInvitations } from "../src/lib/api/invitations";
import {
  fetchMembersView,
  fetchAllMembers,
  fetchMemberPage,
  membersOptions,
  reclaimCandidateSchema,
  type Member,
} from "../src/lib/api/members";
import {
  buildMembersView,
  memberActivity,
  membersCsv,
} from "../src/lib/members-view";

const ORG = "11111111-1111-4111-8111-111111111111";
const period = { startDate: "2026-09-01", endDate: "2026-09-28" };
const value = <T>(value: T | null, reasons: string[] = []) => ({
  value,
  status:
    value === null
      ? ("unavailable" as const)
      : reasons.length
        ? ("partial" as const)
        : ("complete" as const),
  reasons: reasons.length ? reasons : value === null ? ["no_data"] : [],
});
const usage = (cost: string | null, sessions: number | null) => ({
  sessionCount: value(sessions),
  equivalentCostUsd: value(cost),
});
const member = (index: number, extra: Partial<Member> = {}): Member => ({
  memberId: `member-${index}`,
  account: `member${index}@example.test`,
  displayName: `구성원 ${index}`,
  team: { teamId: "team-a", teamName: "플랫폼" },
  role: "member",
  status: "active",
  version: 1000 + index,
  periodUsage: usage(String(index), index),
  lastUsedAt: "2026-09-27T01:00:00Z",
  seatState: "unknown",
  ...extra,
});
const unavailable = {
  availability: "unavailable" as const,
  reason: "not_applicable",
  data: null,
};
const notSent = {
  status: "not_sent",
  reason: "mail_disabled",
  queuedAt: null,
  lastAttemptAt: null,
  sentAt: null,
  failureCode: null,
  attempts: 0,
};
const meta = (snapshotId = "snapshot-1") => ({
  organizationId: ORG,
  asOf: "2026-09-29T00:00:00Z",
  startDate: period.startDate,
  endDate: period.endDate,
  snapshotId,
});
const dashboard = (
  members: Member[],
  total: number,
  nextOffset: number | null,
  unassigned: Member[] = [],
) => ({
  meta: meta(),
  summary: {
    rosterMembers: total,
    activeUsers: value<number>(null),
    unassignedMembers: unassigned.length,
    periodUnassignedEquivalentCostUsd: value<string>(null),
    periodUnassignedCostShare: value<number>(null),
    reclaimCandidates: value<number>(null, ["not_applicable"]),
  },
  policy: { idleDays: 14, version: 0 },
  capabilities: {
    invite: true,
    assignTeam: true,
    reclaimSeats: false,
    restoreSeats: false,
  },
  members: { items: members, totalCount: total, nextOffset },
  unassigned: {
    items: unassigned,
    totalCount: unassigned.length,
    nextOffset: null,
  },
  reclaimCandidates: unavailable,
});

test("members load only the first roster page; later pages and CSV use the same snapshot", async () => {
  const original = global.fetch,
    urls: URL[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    urls.push(url);
    if (url.pathname.endsWith("/members/dashboard"))
      return Response.json(dashboard([member(1), member(2)], 5, 2));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return Response.json({
      meta: meta(),
      members:
        offset === 0
          ? { items: [member(1), member(2)], totalCount: 5, nextOffset: 2 }
          : offset === 2
            ? { items: [member(3), member(4)], totalCount: 5, nextOffset: 4 }
            : { items: [member(5)], totalCount: 5, nextOffset: null },
    });
  };
  try {
    const view = await fetchMembersView(ORG, period);
    assert.deepEqual(
      view.members.map((m) => m.memberId),
      ["member-1", "member-2"],
    );
    assert.equal(view.initialMembers?.nextOffset, 2);
    assert.equal(urls.length, 1, "first render does not fetch every member");
    const next = await fetchMemberPage(ORG, period, view.meta.snapshotId, 2, {
      q: "사용자",
      status: "active",
      sort: "cost",
      order: "desc",
    });
    assert.equal(next.members.nextOffset, 4);
    assert.equal(urls[1].searchParams.get("q"), "사용자");
    assert.equal(urls[1].searchParams.get("order"), "desc");
    const all = await fetchAllMembers(ORG, period, view.meta.snapshotId);
    assert.equal(all.length, 5);
    assert.deepEqual(
      urls.slice(2).map((u) => u.searchParams.get("offset")),
      ["0", "2", "4"],
    );
    assert.ok(
      urls
        .slice(1)
        .every((u) => u.searchParams.get("snapshotId") === "snapshot-1"),
    );
    assert.notDeepEqual(
      membersOptions(ORG, period).queryKey,
      membersOptions("another-org", period).queryKey,
    );
  } finally {
    global.fetch = original;
  }
});

test("invalid pages and mixed snapshots are rejected; dashboard expiration retries once", async () => {
  const original = global.fetch;
  const invalid = (e: unknown) =>
    e instanceof ManagementError && e.code === "invalid_response";
  try {
    let calls = 0;
    global.fetch = async () =>
      ++calls === 1
        ? Response.json(
            { error: { code: "snapshot_expired", message: "expired" } },
            { status: 409 },
          )
        : Response.json(dashboard([member(1)], 1, null));
    assert.equal((await fetchMembersView(ORG, period)).members.length, 1);
    assert.equal(calls, 2);
    for (const body of [
      dashboard([member(1)], 2, null),
      {
        ...dashboard([member(1)], 1, null),
        meta: { ...meta(), organizationId: "another-org" },
      },
      {
        ...dashboard([member(1)], 1, null),
        meta: { ...meta(), endDate: "2026-09-27" },
      },
    ]) {
      global.fetch = async () => Response.json(body);
      await assert.rejects(fetchMembersView(ORG, period), invalid);
    }
    for (const body of [
      {
        meta: meta("another-snapshot"),
        members: { items: [member(1)], totalCount: 1, nextOffset: null },
      },
      {
        meta: meta(),
        members: { items: [member(1)], totalCount: 2, nextOffset: 0 },
      },
      { meta: meta(), members: { items: [], totalCount: 2, nextOffset: 1 } },
      {
        meta: meta(),
        members: {
          items: [member(1), member(1)],
          totalCount: 2,
          nextOffset: null,
        },
      },
    ]) {
      global.fetch = async () => Response.json(body);
      await assert.rejects(fetchAllMembers(ORG, period, "snapshot-1"), invalid);
    }
    global.fetch = async () =>
      Response.json({ error: { code: "forbidden" } }, { status: 403 });
    await assert.rejects(
      fetchMembersView(ORG, period),
      (e: unknown) => e instanceof ManagementError && e.status === 403,
    );
  } finally {
    global.fetch = original;
  }
});

test("waiting invitations keep the status and member filters on every page", async () => {
  const original = global.fetch,
    urls: URL[] = [];
  const invitation = (id: string, status: string) => ({
    invitationId: id,
    email: `${id}@example.test`,
    role: "member",
    createdAt: "2026-09-20T00:00:00Z",
    expiresAt: "2026-09-23T00:00:00Z",
    installationUsedAt: null,
    signupUsedAt: null,
    revokedAt: null,
    status,
    memberId: `member-${id}`,
    memberStatus: "invited",
    team: null,
    memberVersion: 1,
    delivery: notSent,
  });
  global.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    urls.push(url);
    const status = url.searchParams.get("status")!;
    if (status === "pending")
      return Response.json(
        url.searchParams.get("cursor")
          ? { items: [invitation("b", status)], nextCursor: null }
          : { items: [invitation("a", status)], nextCursor: "a" },
      );
    return Response.json({
      items: [invitation("c", status)],
      nextCursor: null,
    });
  };
  try {
    const items = await fetchWaitingInvitations(ORG);
    assert.deepEqual(
      items.map((item) => [item.invitationId, item.status]),
      [
        ["a", "pending"],
        ["b", "pending"],
        ["c", "expired"],
      ],
    );
    assert.deepEqual(
      urls.map((url) => [
        url.searchParams.get("status"),
        url.searchParams.get("memberStatus"),
        url.searchParams.get("cursor"),
      ]),
      [
        ["pending", "invited", null],
        ["pending", "invited", "a"],
        ["expired", "invited", null],
      ],
    );
    assert.ok(
      urls.every(
        (url) =>
          url.pathname.startsWith("/api/bff/enrollment/") &&
          url.pathname.endsWith("/invitations"),
      ),
    );
  } finally {
    global.fetch = original;
  }
});

test("view keeps unknown values unknown and never invents reclaim candidates", () => {
  const roster = [
    member(1, { periodUsage: usage("12.5", 3) }),
    member(2, { periodUsage: null, lastUsedAt: "2026-08-20T00:00:00Z" }),
    member(3, {
      periodUsage: null,
      lastUsedAt: null,
      team: { teamId: null, teamName: "미배정" },
    }),
    member(4, { periodUsage: usage(null, null), role: "admin" }),
  ];
  const view = {
    ...dashboard(roster, 4, null, [roster[2]]),
    members: roster,
    unassigned: [roster[2]],
  };
  const now = Date.parse("2026-09-21T00:00:00Z");
  const model = buildMembersView(
    view,
    [
      {
        invitationId: "i1",
        email: "new@example.test",
        role: "member",
        createdAt: "2026-09-20T00:00:00Z",
        expiresAt: "2026-09-23T00:00:00Z",
        installationUsedAt: null,
        signupUsedAt: null,
        revokedAt: null,
        status: "pending",
        memberId: "m-new",
        memberStatus: "invited",
        team: { teamId: "team-a", teamName: "플랫폼" },
        memberVersion: 7,
        delivery: {
          status: "sent",
          reason: null,
          queuedAt: "2026-09-20T00:00:00Z",
          lastAttemptAt: "2026-09-20T00:00:05Z",
          sentAt: "2026-09-20T00:00:05Z",
          failureCode: null,
          attempts: 1,
        },
      },
      {
        invitationId: "i2",
        email: "late@example.test",
        role: "admin",
        createdAt: "2026-09-01T00:00:00Z",
        expiresAt: "2026-09-04T00:00:00Z",
        installationUsedAt: null,
        signupUsedAt: null,
        revokedAt: null,
        status: "expired",
        memberId: "m-late",
        memberStatus: "invited",
        team: null,
        memberVersion: 8,
        delivery: notSent,
      },
    ],
    now,
  );

  assert.deepEqual(
    model.memberRows.map((row) => row.activity),
    ["active", "idle", "unobserved", "active"],
  );
  assert.deepEqual(
    model.memberRows.map((row) => row.costText),
    ["$12.50", "-", "-", "-"],
  );
  assert.deepEqual(
    model.memberRows.map((row) => row.costValue),
    [12.5, null, null, null],
  );
  assert.equal(model.memberRows[2].lastSeen, "-");
  assert.equal(model.memberRows[0].lastSeen, "2026.09.27 10:00");
  assert.equal(model.memberRows[3].roleLabel, "관리자");
  assert.equal(model.memberRows[0].seatStateLabel, "확인 불가");

  const cards = Object.fromEntries(
    model.memberCards.map((card) => [card.label, card]),
  );
  assert.equal(cards["구성원"].value, "4");
  assert.match(cards["구성원"].caption, /기간 활성 -명/);
  assert.equal(
    cards["좌석 회수 후보"].value,
    "-",
    "좌석 원장이 없으면 0석이 아니다",
  );
  assert.match(
    cards["좌석 회수 후보"].caption,
    /등록한 제품이 없어 좌석 원장이 없습니다/,
  );
  assert.equal(cards["초대 대기"].value, "1");
  assert.match(cards["초대 대기"].caption, /만료 1명/);
  assert.equal(cards["팀 미배정"].value, "1");
  assert.match(cards["팀 미배정"].caption, /기간 미배분 비용 -$/);
  assert.equal(model.reclaim.available, false);

  assert.deepEqual(
    model.inviteRows!.map((row) => [
      row.email,
      row.teamLabel,
      row.roleLabel,
      row.expiryText,
      row.issuedText,
    ]),
    [
      ["new@example.test", "플랫폼", "구성원", "2일 남음", "2026.09.20 발급"],
      ["late@example.test", "팀 미배정", "관리자", "만료됨", "2026.09.01 발급"],
    ],
  );
  // 대기자 편집은 초대 목록이 준 구성원 ID·팀·역할·version을 그대로 쓴다. 이메일로 짝짓지 않는다.
  assert.deepEqual(
    model.inviteRows!.map((row) => [
      row.memberId,
      row.teamId,
      row.role,
      row.memberVersion,
    ]),
    [
      ["m-new", "team-a", "member", 7],
      ["m-late", null, "admin", 8],
    ],
  );
  assert.deepEqual(
    model.unassignedRows.map((row) => [row.memberId, row.costText]),
    [["member-3", "-"]],
  );

  // 초대 조회가 실패했으면 0명이 아니라 확인 불가다.
  const withoutInvites = buildMembersView(view, undefined, now);
  assert.equal(
    withoutInvites.memberCards.find((card) => card.label === "초대 대기")!
      .value,
    "-",
  );
  assert.equal(withoutInvites.inviteRows, undefined);
  // 발송 상태는 서버가 준 값을 그대로 옮긴다.
  assert.deepEqual(
    model.inviteRows!.map((row) => [
      row.delivery.state,
      row.delivery.label,
      row.delivery.detail,
    ]),
    [
      ["sent", "메일 발송됨", "2026.09.20 09:00"],
      ["disabled", "메일 발송 꺼짐", "코드를 직접 전달하세요"],
    ],
  );
});

test("reclaim candidates and seat totals come only from the server section", () => {
  const roster = [
    member(1, { periodUsage: null, lastUsedAt: null }),
    member(2),
  ];
  const candidate = {
    seatAssignmentId: "seat-1",
    memberId: "member-2",
    account: "member2@example.test",
    team: { teamId: "team-a", teamName: "플랫폼" },
    vendorId: "v",
    tierId: "t",
    version: 1,
    lastUsedAt: "2026-09-01T00:00:00Z",
    idleDays: 27,
    estimatedMonthlySavingsUsd: null,
    canReclaim: false,
    reason: null,
  };
  const base = dashboard(roster, 2, null);
  const view = {
    ...base,
    members: roster,
    unassigned: [],
    summary: {
      ...base.summary,
      activeUsers: value(1),
      periodUnassignedEquivalentCostUsd: value("5"),
      periodUnassignedCostShare: value(0.25),
      reclaimCandidates: value(1),
    },
    reclaimCandidates: {
      availability: "available" as const,
      reason: null,
      data: { items: [candidate], totalCount: 1, nextCursor: null },
    },
  };
  const model = buildMembersView(view, []);
  // 사용 기록이 없는 member-1 은 후보가 아니고, 서버가 후보로 준 member-2 만 후보다.
  assert.deepEqual(
    model.memberRows.map((row) => row.activity),
    ["unobserved", "candidate"],
  );
  assert.equal(memberActivity(roster[1], new Set()), "active");
  const cards = Object.fromEntries(
    model.memberCards.map((card) => [card.label, card]),
  );
  assert.equal(cards["좌석 회수 후보"].value, "1");
  assert.match(cards["좌석 회수 후보"].caption, /14일/);
  assert.match(cards["팀 미배정"].caption, /\$5\.00 \(25\.0%\)/);
  assert.equal(
    model.reclaim.available && model.reclaim.rows[0].seatAssignmentId,
    "seat-1",
  );
  assert.equal(model.unassignedNote, "모두 배정됨");
});

test("a partial seat ledger keeps its reason next to the counted candidates", () => {
  const roster = [member(1), member(2)];
  const base = dashboard(roster, 2, null);
  const view = {
    ...base,
    members: roster,
    unassigned: [],
    summary: {
      ...base.summary,
      reclaimCandidates: value(0, ["observation_incomplete"]),
    },
    reclaimCandidates: {
      availability: "partial" as const,
      reason: "observation_incomplete",
      data: { items: [], totalCount: 0, nextCursor: null },
    },
  };
  const model = buildMembersView(view, []);
  const cards = Object.fromEntries(
    model.memberCards.map((card) => [card.label, card]),
  );
  // 원장의 값이므로 0석이다 — 다만 낮춘 제품이 있다는 사유를 지우지 않는다.
  assert.equal(cards["좌석 회수 후보"].value, "0");
  assert.equal(
    cards["좌석 회수 후보"].caption,
    "14일 기준 · 관측이 부족한 좌석은 판정하지 않았습니다",
  );
  assert.ok(model.reclaim.available);
  assert.equal(
    model.reclaim.available && model.reclaim.partial,
    "관측이 부족한 좌석은 판정하지 않았습니다",
  );
  assert.equal(model.reclaim.note, "0석 표시 · 전체 0석 · 회수 기준 14일");
});

test("a candidate without a known tier parses as null", () => {
  const candidate = {
    seatAssignmentId: "seat-1",
    memberId: "member-2",
    account: "member2@example.test",
    team: { teamId: null, teamName: "미배정" },
    vendorId: "v",
    tierId: null,
    version: 1,
    lastUsedAt: null,
    idleDays: 31,
    estimatedMonthlySavingsUsd: null,
    canReclaim: false,
    reason: "vendor_control_unavailable",
    vendorAccount: "m2@vendor.example.test",
  };
  const parsed = reclaimCandidateSchema.parse(candidate);
  assert.equal(parsed.tierId, null);
  assert.equal(parsed.vendorAccount, "m2@vendor.example.test");
});

test("CSV exports the whole roster, leaves unknown values empty and neutralizes formulas", () => {
  const roster = [
    member(1, {
      account: "=cmd@example.test",
      displayName: '이름, "별명"',
      periodUsage: usage("12.5", 3),
    }),
    member(2, {
      periodUsage: null,
      lastUsedAt: null,
      team: { teamId: null, teamName: "미배정" },
      role: "admin",
    }),
  ];
  const model = buildMembersView(
    { ...dashboard(roster, 2, null), members: roster, unassigned: [] },
    [],
  );
  const lines = membersCsv(model.memberRows).split("\r\n");
  assert.equal(
    lines[0],
    "계정,이름,팀,역할,계정 상태,사용 관측,기간 환산 비용(USD),기간 세션,마지막 사용(UTC),비용 상태,비용 사유,세션 상태,세션 사유",
  );
  assert.equal(
    lines[1],
    `'=cmd@example.test,"이름, ""별명""",플랫폼,구성원,활성 계정,활성,12.5,3,2026-09-27T01:00:00Z,complete,,complete,`,
  );
  assert.equal(
    lines[2],
    "member2@example.test,구성원 2,미배정,관리자,활성 계정,신호 대기,,,,unavailable,no_data,unavailable,no_data",
  );
  assert.equal(lines.length, 4);
  assert.equal(lines[3], "");
});

test("period values keep state and reasons in the screen and CSV, including confirmed zero", () => {
  const row = member(1, {
    periodUsage: {
      equivalentCostUsd: value("0", [
        "current_period_incomplete",
        "collection_gap",
      ]),
      sessionCount: value(0),
    },
  });
  const base = dashboard([row], 1, null);
  const model = buildMembersView(
    { ...base, members: [row], unassigned: [] },
    [],
  );
  assert.equal(model.memberRows[0].costText, "$0.00");
  assert.equal(model.memberRows[0].costStatus?.label, "관측 근거 부족");
  assert.match(model.memberRows[0].costStatus?.reason ?? "", /보고 공백/);
  assert.equal(model.memberRows[0].sessionCount, 0);
  assert.match(
    membersCsv(model.memberRows),
    /partial,current_period_incomplete\|collection_gap,complete,/,
  );
});

test("pagination rejects changed periods and total counts even when snapshot matches", async () => {
  const original = global.fetch;
  try {
    for (const changed of ["period", "count"]) {
      global.fetch = async (input) => {
        const offset = Number(
          new URL(String(input), "http://localhost").searchParams.get("offset"),
        );
        return Response.json(
          offset === 0
            ? {
                meta: meta(),
                members: { items: [member(1)], totalCount: 2, nextOffset: 1 },
              }
            : {
                meta: {
                  ...meta(),
                  ...(changed === "period" ? { startDate: "2026-09-02" } : {}),
                },
                members: {
                  items: [member(2)],
                  totalCount: changed === "count" ? 3 : 2,
                  nextOffset: null,
                },
              },
        );
      };
      await assert.rejects(
        fetchAllMembers(ORG, period, "snapshot-1"),
        (error) =>
          error instanceof ManagementError && error.code === "invalid_response",
      );
    }
  } finally {
    global.fetch = original;
  }
});

test("member detail preserves the exact member filter, snapshot and cancellation signal", async () => {
  const controller = new AbortController();
  const selected = member(47);
  const result = await fetchMemberPage(
    ORG,
    period,
    "snapshot-detail",
    0,
    { memberId: selected.memberId },
    controller.signal,
    async (path, schema, signal) => {
      const url = new URL(path, "http://localhost");
      assert.equal(url.searchParams.get("memberId"), selected.memberId);
      assert.equal(url.searchParams.get("snapshotId"), "snapshot-detail");
      assert.equal(url.searchParams.get("offset"), "0");
      assert.equal(url.searchParams.has("cursor"), false);
      assert.equal(signal, controller.signal);
      return schema.parse({
        meta: meta("snapshot-detail"),
        members: { items: [selected], totalCount: 1, nextOffset: null },
      });
    },
  );
  assert.deepEqual(result.members.items, [selected]);
});

test("member detail permission failure is not converted into an empty successful page", async () => {
  const failure = new ManagementError("forbidden", 403);
  await assert.rejects(
    fetchMemberPage(
      ORG,
      period,
      "snapshot-detail",
      0,
      { memberId: "member-47" },
      undefined,
      async () => {
        throw failure;
      },
    ),
    (error) => error === failure,
  );
});
