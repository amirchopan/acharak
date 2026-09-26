import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker from "../worker/index.mjs";
import { createD1Database } from "./helpers/d1.mjs";

const migrations = [
  readFileSync(new URL("../migrations/0001_initial_schema.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../migrations/0002_phone_auth.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../migrations/0003_account_data.sql", import.meta.url), "utf8"),
];
const AUTH_SECRET = randomBytes(32).toString("base64url");

function setup() {
  const { db, sqlite } = createD1Database(migrations);
  const env = {
    DB: db,
    AUTH_SECRET,
    AUTH_ENV: "development",
    DEV_OTP_ENABLED: "true",
    APP_ORIGIN: "http://localhost:8080",
  };
  return { env, sqlite };
}

async function call(path, { method = "POST", body, cookie, origin = "http://localhost:8080" } = {}, env) {
  const headers = new Headers({ origin });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  const request = new Request(`http://localhost:8787${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return worker.fetch(request, env);
}

async function register(env, phone = "+98 912 123 4567") {
  const response = await call("/api/auth/register", {
    body: { first_name: "آرمان", last_name: "آچارک", phone },
  }, env);
  return { response, body: await response.json() };
}

async function verify(env, phone, code) {
  return call("/api/auth/otp/verify", { body: { phone, code } }, env);
}

test("register normalizes an Iranian phone and stores no password or plaintext OTP", async () => {
  const { env, sqlite } = setup();

  try {
    const { response, body } = await register(env);
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.match(body.development_otp, /^\d{6}$/);

    const user = sqlite.prepare(
      "SELECT id, phone, first_name, last_name FROM users",
    ).get();
    assert.equal(user.phone, "09121234567");
    assert.equal(user.first_name, "آرمان");
    assert.equal(user.last_name, "آچارک");

    const userColumns = sqlite.prepare("PRAGMA table_info(users)").all();
    assert.ok(userColumns.some(({ name }) => name === "first_name"));
    assert.ok(!userColumns.some(({ name }) => name === "password_hash"));

    const challenge = sqlite.prepare("SELECT code_hash FROM otp_challenges").get();
    assert.notEqual(challenge.code_hash, body.development_otp);
    assert.ok(!JSON.stringify(challenge).includes(body.development_otp));
  } finally {
    sqlite.close();
  }
});

test("duplicate registration is rejected even when the phone uses another format", async () => {
  const { env, sqlite } = setup();

  try {
    const first = await register(env, "۰۹۱۲۱۲۳۴۵۶۷");
    const duplicate = await register(env, "00989121234567");
    assert.equal(first.response.status, 200);
    assert.equal(duplicate.response.status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM users").get().count, 1);
  } finally {
    sqlite.close();
  }
});

test("registration validates required names and Iranian mobile numbers", async () => {
  const { env, sqlite } = setup();

  try {
    const invalidPhone = await call("/api/auth/register", {
      body: { first_name: "آرمان", phone: "12345" },
    }, env);
    assert.equal(invalidPhone.status, 400);

    const missingName = await call("/api/auth/register", {
      body: { first_name: "  ", phone: "09121234567" },
    }, env);
    assert.equal(missingName.status, 400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM users").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("login issues a local OTP for a known phone and hides unknown accounts", async () => {
  const { env, sqlite } = setup();

  try {
    await register(env);
    sqlite.prepare("DELETE FROM otp_request_limits").run();

    const known = await call("/api/auth/login", {
      body: { phone: "00989121234567" },
    }, env);
    const knownBody = await known.json();
    assert.equal(known.status, 200);
    assert.match(knownBody.development_otp, /^\d{6}$/);

    const unknown = await call("/api/auth/login", {
      body: { phone: "09129999999" },
    }, env);
    const unknownBody = await unknown.json();
    assert.equal(unknown.status, 200);
    assert.equal(unknownBody.message, knownBody.message);
    assert.equal(unknownBody.resend_after_seconds, knownBody.resend_after_seconds);
    assert.equal("development_otp" in unknownBody, false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM otp_challenges").get().count, 2);
  } finally {
    sqlite.close();
  }
});

test("OTP request is throttled and production never returns a development code", async () => {
  const { env, sqlite } = setup();

  try {
    const { body } = await register(env);
    assert.match(body.development_otp, /^\d{6}$/);

    const limited = await call("/api/auth/otp/request", {
      body: { phone: "09121234567" },
    }, env);
    assert.equal(limited.status, 429);
    assert.ok(Number((await limited.json()).retry_after_seconds) > 0);

    const productionEnv = { ...env, AUTH_ENV: "production" };
    const unavailable = await call("/api/auth/login", {
      body: { phone: "09121234567" },
    }, productionEnv);
    assert.equal(unavailable.status, 503);
    assert.equal("development_otp" in await unavailable.json(), false);
  } finally {
    sqlite.close();
  }
});

test("the OTP request endpoint issues a fresh single-use challenge for an existing account", async () => {
  const { env, sqlite } = setup();

  try {
    const first = await register(env);
    sqlite.prepare("DELETE FROM otp_request_limits").run();

    const response = await call("/api/auth/otp/request", {
      body: { phone: "00989121234567" },
    }, env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.development_otp, /^\d{6}$/);
    assert.equal(sqlite.prepare(
      "SELECT COUNT(*) AS count FROM otp_challenges WHERE consumed_at IS NULL",
    ).get().count, 1);
    assert.notEqual(body.development_otp, first.body.development_otp);
  } finally {
    sqlite.close();
  }
});

test("OTP expiration invalidates the challenge", async () => {
  const { env, sqlite } = setup();

  try {
    const { body } = await register(env);
    sqlite.prepare(
      "UPDATE otp_challenges SET expires_at = ?",
    ).run(new Date(Date.now() - 1000).toISOString());

    const expired = await verify(env, "09121234567", body.development_otp);
    assert.equal(expired.status, 401);

    const reused = await verify(env, "09121234567", body.development_otp);
    assert.equal(reused.status, 401);
  } finally {
    sqlite.close();
  }
});

test("wrong OTP is rejected and verify attempts are limited", async () => {
  const { env, sqlite } = setup();

  try {
    const { body } = await register(env);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await verify(env, "09121234567", "000000");
      assert.equal(response.status, 401);
    }

    const lastAttempt = await verify(env, "09121234567", "000000");
    assert.equal(lastAttempt.status, 429);
    const overLimit = await verify(env, "09121234567", body.development_otp);
    assert.equal(overLimit.status, 429);
  } finally {
    sqlite.close();
  }
});

test("successful OTP creates an HttpOnly session, /me returns the user, and logout revokes it", async () => {
  const { env, sqlite } = setup();

  try {
    const { body: issued } = await register(env);
    const verified = await verify(env, "09121234567", issued.development_otp);
    const verifiedBody = await verified.json();
    assert.equal(verified.status, 200);
    assert.equal(verifiedBody.authenticated, true);
    assert.deepEqual(
      {
        first_name: verifiedBody.user.first_name,
        last_name: verifiedBody.user.last_name,
        phone: verifiedBody.user.phone,
      },
      { first_name: "آرمان", last_name: "آچارک", phone: "09121234567" },
    );

    const cookie = verified.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    const rawToken = cookie.match(/acharak_session=([^;]+)/)[1];

    const storedSession = sqlite.prepare("SELECT token_hash FROM sessions").get();
    assert.notEqual(storedSession.token_hash, rawToken);
    assert.ok(!JSON.stringify(storedSession).includes(rawToken));

    const me = await call("/api/auth/me", { method: "GET", cookie: `acharak_session=${rawToken}` }, env);
    assert.deepEqual(await me.json(), {
      success: true,
      authenticated: true,
      user: verifiedBody.user,
    });

    const logout = await call("/api/auth/logout", { body: {}, cookie: `acharak_session=${rawToken}` }, env);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 0);

    const afterLogout = await call("/api/auth/me", { method: "GET", cookie: `acharak_session=${rawToken}` }, env);
    assert.deepEqual(await afterLogout.json(), { success: true, authenticated: false });

    const reusedOtp = await verify(env, "09121234567", issued.development_otp);
    assert.equal(reusedOtp.status, 401);
  } finally {
    sqlite.close();
  }
});

test("expired sessions are rejected and removed", async () => {
  const { env, sqlite } = setup();

  try {
    const { body: issued } = await register(env);
    const verified = await verify(env, "09121234567", issued.development_otp);
    const rawToken = verified.headers.get("set-cookie").match(/acharak_session=([^;]+)/)[1];
    sqlite.prepare("UPDATE sessions SET expires_at = ?")
      .run(new Date(Date.now() - 1000).toISOString());

    const me = await call("/api/auth/me", { method: "GET", cookie: `acharak_session=${rawToken}` }, env);
    assert.deepEqual(await me.json(), { success: true, authenticated: false });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("cross-origin auth requests outside the configured app origin are blocked", async () => {
  const { env, sqlite } = setup();

  try {
    const response = await call("/api/auth/login", {
      origin: "https://attacker.example",
      body: { phone: "09121234567" },
    }, env);
    assert.equal(response.status, 403);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM users").get().count, 0);
  } finally {
    sqlite.close();
  }
});

test("auth preflight allows credentials only for the configured application origin", async () => {
  const { env, sqlite } = setup();

  try {
    const response = await call("/api/auth/login", {
      method: "OPTIONS",
      origin: "http://localhost:8080",
    }, env);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:8080");
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    assert.match(response.headers.get("access-control-allow-methods"), /\bPUT\b/);

    const denied = await call("/api/auth/login", {
      method: "OPTIONS",
      origin: "https://attacker.example",
    }, env);
    assert.equal(denied.status, 403);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM users").get().count, 0);
  } finally {
    sqlite.close();
  }
});
