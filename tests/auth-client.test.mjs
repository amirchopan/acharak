import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  location: {
    hostname: "127.0.0.1",
    port: "5500",
    protocol: "http:",
    origin: "http://127.0.0.1:5500",
  },
};
globalThis.document = {
  querySelector() {
    return null;
  },
};

const { loginWithPhone, registerWithPhone } = await import("../js/auth.js");

test("local frontend ports use the Wrangler Worker port", async () => {
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = url;
    return new Response(JSON.stringify({ success: true }), {
      headers: { "content-type": "application/json" },
    });
  };

  await loginWithPhone({ phone: "09121234567" });
  assert.equal(requestUrl, "http://127.0.0.1:8787/api/auth/login");
});

test("login and registration send the user's password to the Worker", async () => {
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify({
      success: true,
      authenticated: true,
      user: { id: "user-1", phone: "09121234567" },
    }), {
      headers: { "content-type": "application/json" },
    });
  };

  await loginWithPhone({ phone: "09121234567", password: "secure-pass-123" });
  await registerWithPhone({
    first_name: "آرمان",
    last_name: "آچارک",
    phone: "09121234567",
    password: "secure-pass-123",
  });

  assert.deepEqual(bodies, [
    { phone: "09121234567", password: "secure-pass-123" },
    {
      first_name: "آرمان",
      last_name: "آچارک",
      phone: "09121234567",
      password: "secure-pass-123",
    },
  ]);
});

test("HTML and other non-JSON responses report the Worker URL and status", async () => {
  globalThis.fetch = async () => new Response("<!doctype html>", {
    status: 404,
    headers: { "content-type": "text/html" },
  });

  await assert.rejects(
    loginWithPhone({ phone: "09121234567" }),
    /Worker در http:\/\/127\.0\.0\.1:8787.*HTTP 404/,
  );
});

test("unreachable local Workers show an actionable connection error", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  await assert.rejects(
    loginWithPhone({ phone: "09121234567" }),
    /http:\/\/127\.0\.0\.1:8787.*npx wrangler@4 dev/,
  );
});

test("production requests use the recreated application Worker hostname", async () => {
  globalThis.window.location.hostname = "acharak.amirchopan2001.workers.dev";
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://acharak.amirchopan2001.workers.dev/api/auth/login");
    return new Response(JSON.stringify({ success: true }), {
      headers: { "content-type": "application/json" },
    });
  };

  const productionAuth = await import("../js/auth.js?production-worker-test");
  await productionAuth.loginWithPhone({ phone: "09121234567" });
  globalThis.window.location.hostname = "127.0.0.1";
});
