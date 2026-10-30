import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

// Set before the server module loads: loadEnvFile() only fills keys that are still empty,
// so these keep the tests on the in-memory store and away from any real database or LLM key.
process.env.MAGERLIFE_DB_DRIVER = "memory";
process.env.MAGERLIFE_ADMIN_EMAILS = "owner@example.com";
process.env.MAGERLIFE_SESSION_SECRET = "test-session-secret";
process.env.MAGERLIFE_LLM_PROVIDER = "groq";
process.env.MAGERLIFE_ENABLE_REAL_LLM = "true";
process.env.GROQ_API_KEY = "server-key-for-tests";
process.env.GROQ_BASE_URL = "https://llm.server-default.test/v1";
process.env.MAGERLIFE_RATE_LIMIT_PER_MIN = "10000";

const { createMagerLifeApiServer } = await import("../src/server/mockApiServer.mjs");

const PASSWORD = "Str0ng!Password";
const realFetch = globalThis.fetch;
const outboundRequests = [];
let server;
let baseUrl;

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = method === "GET" && body ? `${baseUrl}${path}?payload=${encodeURIComponent(JSON.stringify(body))}` : `${baseUrl}${path}`;
  const response = await realFetch(url, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body || {}) });
  return { status: response.status, data: await response.json() };
}

async function register(email) {
  const { status, data } = await api("POST", "/auth/register", { body: { email, password: PASSWORD, profile: { name: email } } });
  assert.equal(status, 201);
  return data.token;
}

function foodItem(id, source, extra = {}) {
  return { id, name: id, source, kcalPer100g: 100, ...extra };
}

before(async () => {
  // Only calls to the local test server go out; anything else is recorded and refused.
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    outboundRequests.push({ url, authorization: init.headers?.Authorization || "" });
    return new Response("blocked in tests", { status: 503 });
  };
  server = createMagerLifeApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

describe("admin role", () => {
  test("only the configured email is admin", async () => {
    const ownerToken = await register("owner@example.com");
    const friendToken = await register("friend@example.com");
    assert.equal((await api("GET", "/admin/analytics", { token: ownerToken })).status, 200);
    assert.equal((await api("GET", "/admin/analytics", { token: friendToken })).status, 403);
  });

  test("a user cannot grant themselves admin through /persistence/sync", async () => {
    const token = await register("climber@example.com");
    const sync = await api("POST", "/persistence/sync", {
      token,
      body: { userId: "climber@example.com", profile: { email: "climber@example.com", role: "admin" } },
    });
    assert.equal(sync.status, 200);

    const login = await api("POST", "/auth/login", { body: { identifier: "climber@example.com", password: PASSWORD } });
    assert.equal(login.data.profile.role, "user");
    assert.equal((await api("GET", "/admin/analytics", { token: login.data.token })).status, 403);
  });
});

describe("food library", () => {
  test("the admin can edit the shared library", async () => {
    const token = (await api("POST", "/auth/login", { body: { identifier: "owner@example.com", password: PASSWORD } })).data.token;
    const saved = await api("POST", "/food-library", {
      token,
      body: { userId: "owner@example.com", items: [foodItem("shared-rice", "admin")] },
    });
    assert.equal(saved.data.accepted, 1);
    const shared = await api("GET", "/food-library", { body: { scope: "admin" } });
    assert.ok(shared.data.items.some((item) => item.id === "shared-rice"));
  });

  test("other users cannot add to or overwrite the shared library", async () => {
    const token = await register("guest@example.com");
    const saved = await api("POST", "/food-library", {
      token,
      body: {
        userId: "guest@example.com",
        items: [foodItem("guest-shared", "admin"), foodItem("shared-rice", "user", { name: "hijacked" })],
      },
    });
    assert.equal(saved.data.accepted, 0);
    assert.equal(saved.data.rejected, 2);

    const shared = await api("GET", "/food-library", { body: { scope: "admin" } });
    assert.ok(!shared.data.items.some((item) => item.id === "guest-shared"));
    assert.equal(shared.data.items.find((item) => item.id === "shared-rice").name, "shared-rice");
  });

  test("users save private foods under their own email only", async () => {
    const token = (await api("POST", "/auth/login", { body: { identifier: "guest@example.com", password: PASSWORD } })).data.token;
    const saved = await api("POST", "/food-library", {
      token,
      body: { userId: "guest@example.com", items: [foodItem("guest-pho", "user", { ownerEmail: "friend@example.com" })] },
    });
    assert.equal(saved.data.accepted, 1);
    assert.equal(saved.data.items[0].ownerEmail, "guest@example.com");
  });
});

describe("LLM routes", () => {
  test("require a session", async () => {
    for (const path of ["/chat/turn", "/nutrition/resolve-food", "/profile/update"]) {
      assert.equal((await api("POST", path, { body: { text: "hi" } })).status, 401, path);
    }
  });

  test("never send the server key to a client-chosen baseUrl", async () => {
    const token = (await api("POST", "/auth/login", { body: { identifier: "guest@example.com", password: PASSWORD } })).data.token;
    outboundRequests.length = 0;
    const result = await api("POST", "/chat/turn", {
      token,
      body: { text: "hi", aiOverride: { provider: "groq", baseUrl: "https://attacker.test/v1" } },
    });
    assert.equal(result.status, 200);
    assert.ok(outboundRequests.length > 0);
    for (const request of outboundRequests) {
      assert.ok(!request.url.includes("attacker.test"), `leaked to ${request.url}`);
    }
  });
});
