import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setImmediate as flushTasks } from "node:timers/promises";
import {
  AuthError,
  clearBackendSession,
  getSessionState,
  invalidateBackendSessionCheck,
  restoreBackendSession,
  sessionFetch,
  subscribeBackendIdentityChange,
} from "../src/lib/api/session";

const originalFetch = globalThis.fetch;
const user = {
  memberId: "member",
  organizationId: "11111111-1111-4111-8111-111111111111",
  organizationName: "회사",
  email: "admin@example.test",
  displayName: null,
  role: "admin",
};
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearBackendSession();
});

test("동시 세션 확인을 합치고 확인 중 상태를 노출한다", async () => {
  clearBackendSession();
  let requests = 0,
    release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async () => {
    requests++;
    await pending;
    return Response.json({ user });
  };
  const tasks = Array.from({ length: 10 }, () => restoreBackendSession(true));
  assert.equal(getSessionState().status, "checking");
  assert.equal(requests, 1);
  release();
  await Promise.all(tasks);
  assert.deepEqual(getSessionState(), {
    status: "authenticated",
    session: { user },
  });
});

test("일시 오류·403은 사용자 정리 이벤트를 발행하지 않고 재시도 성공으로 복구한다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  let changes = 0;
  const unsubscribe = subscribeBackendIdentityChange(() => {
    changes++;
  });
  try {
    for (const status of [403, 429, 503]) {
      globalThis.fetch = async () => Response.json({}, { status });
      await assert.rejects(restoreBackendSession(true));
      const state = getSessionState();
      assert.equal(state.status, "error");
      if (state.status === "error") assert.equal(state.error.status, status);
      assert.equal(changes, 0);
      globalThis.fetch = async () => Response.json({ user });
      await restoreBackendSession(true);
      assert.equal(getSessionState().status, "authenticated");
      assert.equal(changes, 0);
    }
    globalThis.fetch = async () => {
      throw new TypeError("network");
    };
    await assert.rejects(restoreBackendSession(true));
    assert.equal(getSessionState().status, "error");
    assert.equal(changes, 0);
  } finally {
    unsubscribe();
  }
});

test("401과 익명 세션은 사용자 변경 이벤트로 관련 캐시 정리를 요청한다", async () => {
  for (const source of ["session401", "anonymous", "api401"]) {
    globalThis.fetch = async () => Response.json({ user });
    await restoreBackendSession(true);
    let changes = 0;
    const unsubscribe = subscribeBackendIdentityChange(() => {
      changes++;
    });
    try {
      globalThis.fetch = async () =>
        source === "anonymous"
          ? Response.json({ user: null })
          : Response.json({}, { status: 401 });
      if (source === "api401")
        await sessionFetch(
          "/api/bff/dashboard/api/v1/organizations/test/settings",
        );
      else await restoreBackendSession(true);
      assert.equal(getSessionState().status, "anonymous");
      assert.equal(changes, 1);
    } finally {
      unsubscribe();
    }
  }
});

test("업무 API의 401만으로 유효한 세션을 익명으로 바꾸지 않는다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  const requests: string[] = [];
  let changes = 0;
  const unsubscribe = subscribeBackendIdentityChange(() => changes++);
  try {
    globalThis.fetch = async (input) => {
      requests.push(String(input));
      return String(input) === "/api/bff/auth/session"
        ? Response.json({ user })
        : Response.json({}, { status: 401 });
    };
    const result = await sessionFetch(
      "/api/bff/dashboard/api/v1/organizations/test/analytics/overview",
    );
    assert.equal(result.status, 401);
    assert.equal(getSessionState().status, "authenticated");
    assert.equal(changes, 0);
    assert.deepEqual(requests, [
      "/api/bff/dashboard/api/v1/organizations/test/analytics/overview",
      "/api/bff/auth/session",
    ]);
  } finally {
    unsubscribe();
  }
});

test("업무 401 뒤 세션 확인 오류는 인증 오류로 유지하고 재시도로 복구한다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  globalThis.fetch = async (input) =>
    Response.json(
      {},
      {
        status: String(input) === "/api/bff/auth/session" ? 503 : 401,
      },
    );
  await assert.rejects(
    sessionFetch("/api/bff/dashboard/api/v1/organizations/test/settings"),
  );
  assert.equal(getSessionState().status, "error");
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  assert.equal(getSessionState().status, "authenticated");
});

test("업무 401 재확인 중 계정이 바뀌면 이전 계정 응답을 폐기한다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  globalThis.fetch = async (input) =>
    String(input) === "/api/bff/auth/session"
      ? Response.json({ user: { ...user, memberId: "different-member" } })
      : Response.json({}, { status: 401 });
  await assert.rejects(
    sessionFetch("/api/bff/dashboard/api/v1/organizations/test/settings"),
    { name: "AbortError" },
  );
  const state = getSessionState();
  assert.equal(state.status, "authenticated");
  if (state.status === "authenticated")
    assert.equal(state.session.user.memberId, "different-member");
});

test("로그아웃 이후 도착한 이전 세션 응답으로 사용자가 복원되지 않는다", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async () => {
    await pending;
    return Response.json({ user });
  };
  const task = restoreBackendSession(true);
  clearBackendSession();
  release();
  await task;
  assert.equal(getSessionState().status, "anonymous");
});

test("잘못된 성공 응답은 미로그인이 아닌 확인 실패로 처리한다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  let changes = 0;
  const unsubscribe = subscribeBackendIdentityChange(() => {
    changes++;
  });
  try {
    for (const body of [{}, { user: false }, { user: {} }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(restoreBackendSession(true));
      assert.equal(getSessionState().status, "error");
      assert.equal(changes, 0);
    }
  } finally {
    unsubscribe();
  }
});

test("캐시 복원은 이전 확인 요청을 공유하지 않고 늦은 익명 응답도 무시한다", async () => {
  let release!: () => void,
    requests = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async () => {
    requests++;
    if (requests === 1) {
      await pending;
      return Response.json({ user: null });
    }
    return Response.json({ user });
  };
  const oldCheck = restoreBackendSession(true);
  invalidateBackendSessionCheck();
  assert.equal(getSessionState().status, "checking");
  await restoreBackendSession(true);
  assert.equal(requests, 2);
  release();
  await oldCheck;
  assert.deepEqual(getSessionState(), {
    status: "authenticated",
    session: { user },
  });
});

for (const status of [200, 503]) {
  for (const responseFirst of [false, true]) {
    test(`동일 신원 재확인은 진행 중 업무 응답 ${status}를 보존한다 (${responseFirst ? "업무 응답 먼저" : "신원 확인 먼저"})`, async () => {
      globalThis.fetch = async () => Response.json({ user });
      await restoreBackendSession(true);
      let releaseBusiness!: () => void;
      let releaseCheck!: () => void;
      const businessGate = new Promise<void>((resolve) => {
        releaseBusiness = resolve;
      });
      const checkGate = new Promise<void>((resolve) => {
        releaseCheck = resolve;
      });
      const body =
        status === 200
          ? { memberId: "member", version: 2 }
          : { error: { code: "unavailable", message: "isolated503" } };
      let checks = 0;
      globalThis.fetch = async (input) => {
        if (String(input) === "/api/bff/auth/session") {
          checks++;
          await checkGate;
          return Response.json({ user });
        }
        await businessGate;
        return Response.json(body, { status });
      };
      let settled = false;
      const pending = sessionFetch(
        "/api/bff/enrollment/api/v1/organizations/test/members/member",
        {
          method: "PATCH",
          body: JSON.stringify({ expectedVersion: 1, teamId: "team" }),
        },
      ).then(
        (response) => {
          settled = true;
          return { response };
        },
        (error: unknown) => {
          settled = true;
          return { error };
        },
      );
      // RouteGuard's hidden/visible sequence invalidates only the check; the account is unchanged.
      invalidateBackendSessionCheck();
      invalidateBackendSessionCheck();
      const checking = restoreBackendSession(true);
      try {
        if (responseFirst) {
          releaseBusiness();
          await flushTasks();
          assert.equal(
            settled,
            false,
            "응답은 진행 중 신원 확인에 합류해야 한다",
          );
          releaseCheck();
          await checking;
        } else {
          releaseCheck();
          await checking;
          releaseBusiness();
        }
        const outcome = await pending;
        assert.ok(
          "response" in outcome,
          "같은 신원 재확인을 계정 변경으로 처리하면 안 된다",
        );
        if ("response" in outcome) {
          assert.equal(outcome.response.status, status);
          assert.deepEqual(await outcome.response.json(), body);
        }
        assert.equal(
          checks,
          1,
          "진행 중 확인에 합류하며 중복 세션 요청을 만들지 않는다",
        );
        assert.equal(getSessionState().status, "authenticated");
      } finally {
        releaseBusiness();
        releaseCheck();
        await checking;
        await pending;
      }
    });
  }
}

for (const transition of [
  "다른 신원 후 원래 신원",
  "로그아웃 후 같은 신원",
] as const) {
  test(`업무 응답은 ${transition}에도 이전 신원 세대의 결과를 폐기한다`, async () => {
    globalThis.fetch = async () => Response.json({ user });
    await restoreBackendSession(true);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sessionUser = user;
    globalThis.fetch = async (input) => {
      if (String(input) === "/api/bff/auth/session")
        return Response.json({ user: sessionUser });
      await gate;
      return Response.json({ oldResult: true });
    };
    const pending = sessionFetch(
      "/api/bff/enrollment/api/v1/organizations/test/members/member",
      { method: "PATCH" },
    );
    const rejected = assert.rejects(pending, { name: "AbortError" });
    try {
      if (transition === "다른 신원 후 원래 신원") {
        sessionUser = { ...user, memberId: "other-member" };
        await restoreBackendSession(true);
      } else {
        clearBackendSession();
      }
      sessionUser = user;
      await restoreBackendSession(true);
      assert.deepEqual(getSessionState(), {
        status: "authenticated",
        session: { user },
      });
      release();
      await rejected;
    } finally {
      release();
      await rejected;
    }
  });
}

for (const confirmation of ["changed", "anonymous", "error"] as const) {
  test(`업무 응답이 먼저 와도 재확인 ${confirmation} 결과 전에는 전달하지 않는다`, async () => {
    globalThis.fetch = async () => Response.json({ user });
    await restoreBackendSession(true);
    let releaseBusiness!: () => void;
    let releaseCheck!: () => void;
    const businessGate = new Promise<void>((resolve) => {
      releaseBusiness = resolve;
    });
    const checkGate = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    globalThis.fetch = async (input) => {
      if (String(input) === "/api/bff/auth/session") {
        await checkGate;
        return confirmation === "error"
          ? Response.json({}, { status: 503 })
          : Response.json({
              user:
                confirmation === "anonymous"
                  ? null
                  : { ...user, memberId: "other-member" },
            });
      }
      await businessGate;
      return Response.json({ oldResult: true });
    };
    let settled = false;
    const pending = sessionFetch(
      "/api/bff/enrollment/api/v1/organizations/test/members/member",
      { method: "PATCH" },
    ).then(
      (response) => {
        settled = true;
        return { response };
      },
      (error: unknown) => {
        settled = true;
        return { error };
      },
    );
    invalidateBackendSessionCheck();
    const checking = restoreBackendSession(true).catch(() => undefined);
    try {
      releaseBusiness();
      await flushTasks();
      assert.equal(settled, false);
      releaseCheck();
      await checking;
      const outcome = await pending;
      assert.ok("error" in outcome);
      if ("error" in outcome) {
        assert.ok(outcome.error instanceof Error);
        if (confirmation === "error") {
          assert.ok(outcome.error instanceof AuthError);
          assert.equal("status" in outcome.error && outcome.error.status, 503);
        } else assert.equal(outcome.error.name, "AbortError");
      }
    } finally {
      releaseBusiness();
      releaseCheck();
      await checking;
      await pending;
    }
  });
}

test("진행 중 업무 응답은 폐기된 재확인 오류 대신 최신 동일 신원 확인에 합류한다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  let releaseBusiness!: () => void,
    releaseOld!: () => void,
    releaseNew!: () => void;
  const businessGate = new Promise<void>((resolve) => {
    releaseBusiness = resolve;
  });
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  const newGate = new Promise<void>((resolve) => {
    releaseNew = resolve;
  });
  let checks = 0;
  globalThis.fetch = async (input) => {
    if (String(input) === "/api/bff/auth/session") {
      if (++checks === 1) {
        await oldGate;
        return Response.json({}, { status: 503 });
      }
      await newGate;
      return Response.json({ user });
    }
    await businessGate;
    return Response.json({ saved: true });
  };
  const pending = sessionFetch(
    "/api/bff/enrollment/api/v1/organizations/test/members/member",
    { method: "PATCH" },
  );
  invalidateBackendSessionCheck();
  const oldCheck = restoreBackendSession(true).catch(() => undefined);
  releaseBusiness();
  await flushTasks();
  invalidateBackendSessionCheck();
  const newCheck = restoreBackendSession(true);
  try {
    releaseOld();
    await oldCheck;
    releaseNew();
    await newCheck;
    assert.deepEqual(await (await pending).json(), { saved: true });
    assert.equal(checks, 2);
  } finally {
    releaseBusiness();
    releaseOld();
    releaseNew();
    await oldCheck;
    await newCheck;
    await pending;
  }
});

test("확인 요청과 기존 신원이 없는 직접 API 호출은 별도 세션 요청을 만들지 않는다", async () => {
  clearBackendSession();
  invalidateBackendSessionCheck();
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return Response.json({ data: "public-contract" });
  };
  const response = await sessionFetch(
    "/api/bff/dashboard/api/v1/vendor-catalog",
  );
  assert.deepEqual(await response.json(), { data: "public-contract" });
  assert.deepEqual(requests, ["/api/bff/dashboard/api/v1/vendor-catalog"]);
});

test("업무 응답의 세션 확인 대기 중 로그아웃은 이전 확인 완료 없이 즉시 폐기한다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async (input) => {
    if (String(input) === "/api/bff/auth/session") {
      await gate;
      return Response.json({ user });
    }
    return Response.json({ saved: true });
  };
  invalidateBackendSessionCheck();
  const checking = restoreBackendSession(true);
  let settled = false;
  const pending = sessionFetch(
    "/api/bff/enrollment/api/v1/organizations/test/members/member",
    { method: "PATCH" },
  ).then(
    (response) => {
      settled = true;
      return { response };
    },
    (error: unknown) => {
      settled = true;
      return { error };
    },
  );
  try {
    await flushTasks();
    assert.equal(settled, false);
    clearBackendSession();
    await flushTasks();
    assert.equal(
      settled,
      true,
      "로그아웃은 응답을 기다리는 이전 확인과 독립적으로 요청을 폐기해야 한다",
    );
    const result = await pending;
    assert.ok(
      "error" in result &&
        result.error instanceof Error &&
        result.error.name === "AbortError",
    );
  } finally {
    release();
    await checking;
    await pending;
  }
});

test("새 동일 신원 확인이 끝나면 폐기된 이전 확인을 기다리지 않고 업무 응답을 돌려준다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let checks = 0;
  globalThis.fetch = async (input) => {
    if (String(input) === "/api/bff/auth/session") {
      if (++checks === 1) await oldGate;
      return Response.json({ user });
    }
    return Response.json({ saved: true });
  };
  invalidateBackendSessionCheck();
  const oldCheck = restoreBackendSession(true);
  let settled = false;
  const pending = sessionFetch(
    "/api/bff/enrollment/api/v1/organizations/test/members/member",
    { method: "PATCH" },
  ).then((response) => {
    settled = true;
    return response;
  });
  try {
    await flushTasks();
    assert.equal(settled, false);
    invalidateBackendSessionCheck();
    await restoreBackendSession(true);
    await flushTasks();
    assert.equal(
      settled,
      true,
      "폐기된 확인의 응답 지연이 새 확인 결과를 막으면 안 된다",
    );
    assert.deepEqual(await (await pending).json(), { saved: true });
    assert.equal(checks, 2);
  } finally {
    releaseOld();
    await oldCheck;
    await pending;
  }
});
