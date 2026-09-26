import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/index.mjs";

test("GET /api/health/db returns the requested response after querying D1", async () => {
  let query;
  const env = {
    DB: {
      prepare(sql) {
        query = sql;
        return {
          async first() {
            return { connected: 1 };
          },
        };
      },
    },
  };

  const response = await worker.fetch(
    new Request("https://acharak.example/api/health/db"),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await response.json(), {
    success: true,
    database: "connected",
  });
  assert.equal(query, "SELECT 1 AS connected");
});

test("database query failures return an explicit unavailable response", async () => {
  const originalError = console.error;
  console.error = () => {};

  try {
    const response = await worker.fetch(
      new Request("https://acharak.example/api/health/db"),
      {
        DB: {
          prepare() {
            return {
              async first() {
                throw new Error("database unavailable");
              },
            };
          },
        },
      },
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      success: false,
      database: "disconnected",
    });
  } finally {
    console.error = originalError;
  }
});

test("unknown paths and non-GET health requests are rejected", async () => {
  const notFound = await worker.fetch(
    new Request("https://acharak.example/unknown"),
    {},
  );
  assert.equal(notFound.status, 404);

  const methodNotAllowed = await worker.fetch(
    new Request("https://acharak.example/api/health/db", { method: "POST" }),
    {},
  );
  assert.equal(methodNotAllowed.status, 405);
  assert.equal(methodNotAllowed.headers.get("allow"), "GET");
});
