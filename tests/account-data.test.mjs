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
  readFileSync(new URL("../migrations/0004_password_accounts.sql", import.meta.url), "utf8"),
];

function setup() {
  const { db, sqlite } = createD1Database(migrations);
  return {
    sqlite,
    env: {
      DB: db,
      AUTH_SECRET: randomBytes(32).toString("base64url"),
      AUTH_ENV: "development",
      DEV_OTP_ENABLED: "true",
      APP_ORIGIN: "http://localhost:8080",
    },
  };
}

async function call(path, env, { method = "POST", body, cookie } = {}) {
  const headers = new Headers({ origin: "http://localhost:8080" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return worker.fetch(new Request(`http://localhost:8787${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
}

async function createSession(env) {
  const registration = await call("/api/auth/register", env, {
    body: { first_name: "آرمان", phone: "09121234567" },
  });
  const { development_otp: code } = await registration.json();
  const response = await call("/api/auth/otp/verify", env, {
    body: { phone: "09121234567", code },
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

function snapshot(cars = [], services = []) {
  return {
    cars,
    services,
    reminders: [],
    catalog: [],
    maintenance: [],
    settings: { theme: "auto" },
  };
}

test("account data is private and persists for an authenticated account", async () => {
  const { env, sqlite } = setup();
  try {
    const cookie = await createSession(env);
    const data = snapshot([{ id: "car-1", model: "پراید" }], [{ id: "service-1" }]);
    const saved = await call("/api/account/data", env, {
      method: "PUT",
      cookie,
      body: { mode: "replace", data },
    });
    assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()).data, data);

    const loaded = await call("/api/account/data", env, { method: "GET", cookie });
    assert.equal(loaded.status, 200);
    assert.deepEqual((await loaded.json()).data, data);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM account_data").get().count, 1);

    const unauthorized = await call("/api/account/data", env, { method: "GET" });
    assert.equal(unauthorized.status, 401);
  } finally {
    sqlite.close();
  }
});

test("account merge keeps existing records and applies updates by id", async () => {
  const { env, sqlite } = setup();
  try {
    const cookie = await createSession(env);
    await call("/api/account/data", env, {
      method: "PUT",
      cookie,
      body: { mode: "replace", data: snapshot([{ id: "car-1", model: "قدیم" }]) },
    });

    const response = await call("/api/account/data", env, {
      method: "PUT",
      cookie,
      body: {
        mode: "merge",
        data: snapshot([{ id: "car-1", model: "به‌روز" }, { id: "car-2" }]),
      },
    });
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.deepEqual(data.cars, [{ id: "car-1", model: "به‌روز" }, { id: "car-2" }]);
  } finally {
    sqlite.close();
  }
});

test("account data rejects invalid payloads and unsupported methods", async () => {
  const { env, sqlite } = setup();
  try {
    const cookie = await createSession(env);
    const invalid = await call("/api/account/data", env, {
      method: "PUT",
      cookie,
      body: { mode: "replace", data: { ...snapshot(), cars: [{ id: "duplicate" }, { id: "duplicate" }] } },
    });
    assert.equal(invalid.status, 400);

    const unsupported = await call("/api/account/data", env, {
      method: "DELETE",
      cookie,
    });
    assert.equal(unsupported.status, 405);
    assert.equal(unsupported.headers.get("allow"), "GET, PUT");
  } finally {
    sqlite.close();
  }
});
