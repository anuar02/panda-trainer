import test from "node:test";
import assert from "node:assert/strict";
import { handleDeletion, type Receipt, type Transport } from "./handler.ts";
const id = "11111111-1111-4111-8111-111111111111";
const token = "ab".repeat(32);
const request = (
  action = "delete",
  bearer: string | null = "valid",
  recoveryToken = token,
) =>
  new Request("https://synthetic.invalid", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(
      action === "inspect"
        ? { action }
        : { action, requestId: id, recoveryToken },
    ),
  });
function fixture() {
  let row: Receipt | null = null;
  let hash = "";
  let authExists = true;
  let fail = "";
  const calls: string[] = [];
  const transport: Transport = {
    getUser: async (bearer) =>
      bearer === "valid" && authExists
        ? "owner"
        : bearer === "foreign"
          ? "other"
          : null,
    inspect: async (userId) => ({
      user_id: userId,
      workspace_ids: ["workspace"],
      foreign_client_card_count: 2,
    }),
    status: async (_id, capability) => {
      if (row && capability !== hash) throw new Error("denied");
      return row;
    },
    prepare: async (_id, userId, capability) => {
      calls.push("prepare");
      hash = capability;
      row = { request_id: id, user_id: userId, status: "prepared" };
      return row;
    },
    execute: async () => {
      calls.push("execute");
      if (fail === "db") throw new Error("synthetic");
      row = { ...row!, status: "database_deleted" };
      return row;
    },
    deleteUser: async () => {
      calls.push("auth");
      if (fail === "auth") throw new Error("synthetic");
      authExists = false;
    },
    complete: async () => {
      calls.push("complete");
      if (fail === "complete") throw new Error("synthetic");
      row = { ...row!, status: "complete" };
      return row;
    },
  };
  return {
    transport,
    calls,
    fail: (value: string) => {
      fail = value;
    },
    row: () => row,
    hash: () => hash,
  };
}
test("verified identity, server scope, hash only and completed replay", async () => {
  const f = fixture();
  assert.equal(
    (await handleDeletion(request("inspect"), f.transport)).status,
    200,
  );
  assert.equal((await handleDeletion(request(), f.transport)).status, 200);
  assert.deepEqual(f.calls, ["prepare", "execute", "auth", "complete"]);
  assert.match(f.hash(), /^[0-9a-f]{64}$/);
  assert.notEqual(f.hash(), token);
  assert.equal(
    (await handleDeletion(request("delete", null), f.transport)).status,
    200,
  );
  assert.equal(f.calls.length, 4);
});
test("expired identity and missing identity cannot initiate", async () => {
  for (const bearer of ["expired", null]) {
    const f = fixture();
    assert.equal(
      (await handleDeletion(request("delete", bearer), f.transport)).status,
      401,
    );
    assert.deepEqual(f.calls, []);
  }
});
test("status never initiates and foreign identity cannot resume", async () => {
  const f = fixture();
  assert.equal(
    (await handleDeletion(request("status", null), f.transport)).status,
    404,
  );
  assert.deepEqual(f.calls, []);
  f.fail("db");
  await handleDeletion(request(), f.transport);
  assert.equal(
    (await handleDeletion(request("delete", "foreign"), f.transport)).status,
    403,
  );
  assert.equal(
    (
      await handleDeletion(
        request("delete", null, "cd".repeat(32)),
        f.transport,
      )
    ).status,
    503,
  );
  assert.deepEqual(f.calls, ["prepare", "execute"]);
});
test("database failure persists prepared state and exact retry recovers", async () => {
  const f = fixture();
  f.fail("db");
  const response = await handleDeletion(request(), f.transport);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "retry-required" });
  assert.equal(f.row()?.status, "prepared");
  assert.ok(!f.calls.includes("auth"));
  f.fail("");
  assert.equal(
    (await handleDeletion(request("delete", null), f.transport)).status,
    200,
  );
});
test("Auth failure leaves database_deleted recoverable without another identity", async () => {
  const f = fixture();
  f.fail("auth");
  assert.equal((await handleDeletion(request(), f.transport)).status, 503);
  assert.equal(f.row()?.status, "database_deleted");
  f.fail("");
  assert.equal(
    (await handleDeletion(request("delete", null), f.transport)).status,
    200,
  );
  assert.equal(f.row()?.status, "complete");
});
test("lost completion response after Auth deletion recovers by capability", async () => {
  const f = fixture();
  f.fail("complete");
  assert.equal((await handleDeletion(request(), f.transport)).status, 503);
  assert.equal((await handleDeletion(request(), f.transport)).status, 401);
  f.fail("");
  assert.equal(
    (await handleDeletion(request("delete", null), f.transport)).status,
    200,
  );
  assert.equal(
    (await handleDeletion(request("status", null), f.transport)).status,
    200,
  );
});
test("input rejects account selection and never exposes bearer in diagnostics", async () => {
  const f = fixture();
  const bad = new Request("https://synthetic.invalid", {
    method: "POST",
    body: JSON.stringify({
      action: "delete",
      requestId: id,
      recoveryToken: token,
      userId: "other",
    }),
  });
  assert.equal((await handleDeletion(bad, f.transport)).status, 400);
  const response = await handleDeletion(
    request("delete", "private-bearer"),
    f.transport,
  );
  assert.ok(!(await response.text()).includes("private-bearer"));
  assert.deepEqual(f.calls, []);
});

test("lost prepare and execute responses preserve exact capability recovery", async () => {
  for (const phase of ["prepare", "execute"] as const) {
    const f = fixture();
    const operation = f.transport[phase];
    let loseResponse = true;
    if (phase === "prepare") {
      f.transport.prepare = async (...args) => {
        const receipt = await (operation as Transport["prepare"])(...args);
        if (loseResponse) throw new Error("lost-response");
        return receipt;
      };
    } else {
      f.transport.execute = async (...args) => {
        const receipt = await (operation as Transport["execute"])(...args);
        if (loseResponse) throw new Error("lost-response");
        return receipt;
      };
    }
    assert.equal((await handleDeletion(request(), f.transport)).status, 503);
    assert.equal(
      f.row()?.status,
      phase === "prepare" ? "prepared" : "database_deleted",
    );
    loseResponse = false;
    assert.equal(
      (await handleDeletion(request("delete", null), f.transport)).status,
      200,
    );
    assert.equal(f.row()?.status, "complete");
    assert.equal(f.calls.filter((call) => call === "prepare").length, 1);
  }
});

test("browser preflight needs no identity and all responses allow explicit token headers", async () => {
  const f = fixture();
  const response = await handleDeletion(
    new Request("https://synthetic.invalid", {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.invalid",
        "Access-Control-Request-Headers":
          "authorization,apikey,content-type,x-client-info",
      },
    }),
    f.transport,
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(
    response.headers.get("access-control-allow-methods"),
    "POST, OPTIONS",
  );
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
  assert.match(
    response.headers.get("access-control-allow-headers")!,
    /authorization/,
  );
  assert.deepEqual(f.calls, []);
  assert.equal(
    (await handleDeletion(request("delete", null), f.transport)).headers.get(
      "access-control-allow-origin",
    ),
    "*",
  );
});
test("bounded input rejects oversized declared and streamed bodies without diagnostics leak", async () => {
  const f = fixture();
  for (const headers of [{ "Content-Length": "3000" }, {}]) {
    const response = await handleDeletion(
      new Request("https://synthetic.invalid", {
        method: "POST",
        headers,
        body: "private".repeat(500),
      }),
      f.transport,
    );
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "request-too-large" });
  }
  const response = await handleDeletion(
    new Request("https://synthetic.invalid", {
      method: "POST",
      body: "private-malformed",
    }),
    f.transport,
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid-request" });
  assert.deepEqual(f.calls, []);
});

test("foreign or malformed execute receipt never selects another Auth identity", async () => {
  for (const altered of [
    { user_id: "foreign" },
    { request_id: "22222222-2222-4222-8222-222222222222" },
    { status: "prepared" as const },
  ]) {
    const f = fixture();
    const execute = f.transport.execute;
    f.transport.execute = async (...args) => ({
      ...(await execute(...args)),
      ...altered,
    });
    assert.equal((await handleDeletion(request(), f.transport)).status, 503);
    assert.ok(!f.calls.includes("auth"));
    assert.ok(!f.calls.includes("complete"));
  }
});

test("completion receipt must retain original request, identity and terminal state", async () => {
  for (const altered of [
    { user_id: "foreign" },
    { request_id: "22222222-2222-4222-8222-222222222222" },
    { status: "database_deleted" as const },
  ]) {
    const f = fixture();
    const complete = f.transport.complete;
    f.transport.complete = async (...args) => ({
      ...(await complete(...args)),
      ...altered,
    });
    const response = await handleDeletion(request(), f.transport);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "retry-required" });
  }
});
