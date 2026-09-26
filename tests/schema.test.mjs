import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrations = [
  readFileSync(new URL("../migrations/0001_initial_schema.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../migrations/0002_phone_auth.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../migrations/0003_account_data.sql", import.meta.url), "utf8"),
  readFileSync(new URL("../migrations/0004_password_accounts.sql", import.meta.url), "utf8"),
];

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => db.exec(migration));
  return db;
}

function insertUser(db, id = "user-1", phone = "+989121234567") {
  db.prepare(
    "INSERT INTO users (id, phone, first_name) VALUES (?, ?, ?)",
  ).run(id, phone, "Test");
}

function insertCar(db, id = "car-1", userId = "user-1") {
  db.prepare(
    "INSERT INTO cars (id, user_id, plate, model, year, mileage) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, userId, "12الف345ایران67", "Test model", 2020, 50000);
}

function insertService(db, id = "service-1", carId = "car-1") {
  db.prepare(
    "INSERT INTO services (id, car_id, date, mileage) VALUES (?, ?, ?, ?)",
  ).run(id, carId, "2026-01-01", 50000);
}

function insertServiceItem(db, id = "item-1", serviceId = "service-1") {
  db.prepare(
    "INSERT INTO service_items (id, service_id, type) VALUES (?, ?, ?)",
  ).run(id, serviceId, "oil");
}

test("migration creates every requested table and accepts a complete data hierarchy", () => {
  const db = createDatabase();

  try {
    insertUser(db);
    insertCar(db);
    insertService(db);
    insertServiceItem(db);
    db.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    ).run("session-1", "user-1", "hashed-token", "2027-01-01T00:00:00Z");

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all().map(({ name }) => name);

    assert.deepEqual(tables, [
      "account_data",
      "cars",
      "otp_challenges",
      "otp_request_limits",
      "service_items",
      "services",
      "sessions",
      "users",
    ]);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM service_items").get().count,
      1,
    );
  } finally {
    db.close();
  }
});

test("password migration clears legacy accounts and their dependent data", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  migrations.slice(0, 3).forEach((migration) => db.exec(migration));

  try {
    insertUser(db);
    insertCar(db);
    insertService(db);
    db.prepare("INSERT INTO account_data (user_id, payload) VALUES (?, ?)").run(
      "user-1",
      JSON.stringify({ cars: [] }),
    );
    db.exec(migrations[3]);

    for (const table of ["users", "cars", "services", "sessions", "account_data", "otp_challenges"]) {
      assert.equal(
        db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
        0,
        `${table} should be cleared by the password migration`,
      );
    }
    assert.ok(db.prepare("PRAGMA table_info(users)").all()
      .some(({ name }) => name === "password_hash"));
  } finally {
    db.close();
  }
});

test("phone numbers are unique", () => {
  const db = createDatabase();

  try {
    insertUser(db);
    assert.throws(
      () => insertUser(db, "user-2", "+989121234567"),
      /UNIQUE constraint failed: users\.phone/,
    );
  } finally {
    db.close();
  }
});

test("foreign keys reject records with missing parents", () => {
  const db = createDatabase();

  try {
    assert.throws(() => insertCar(db, "car-orphan"), /FOREIGN KEY constraint failed/);
    assert.throws(
      () => insertService(db, "service-orphan", "car-missing"),
      /FOREIGN KEY constraint failed/,
    );
    assert.throws(
      () => insertServiceItem(db, "item-orphan", "service-missing"),
      /FOREIGN KEY constraint failed/,
    );
    assert.throws(
      () => db.prepare(
        "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
      ).run("session-orphan", "user-missing", "hash", "2027-01-01T00:00:00Z"),
      /FOREIGN KEY constraint failed/,
    );
  } finally {
    db.close();
  }
});

test("deleting a car or user cascades to dependent records", () => {
  const db = createDatabase();

  try {
    insertUser(db);
    insertUser(db, "user-2", "+989121234568");
    insertCar(db);
    insertCar(db, "car-2", "user-2");
    insertService(db);
    insertServiceItem(db);
    db.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    ).run("session-1", "user-1", "hashed-token", "2027-01-01T00:00:00Z");

    db.prepare("DELETE FROM cars WHERE id = ?").run("car-1");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM services").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM service_items").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cars").get().count, 1);

    db.prepare("DELETE FROM users WHERE id = ?").run("user-1");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cars").get().count, 1);
  } finally {
    db.close();
  }
});

test("migration creates the requested lookup indexes", () => {
  const db = createDatabase();

  try {
    const indexesFor = (table) => db.prepare(
      `PRAGMA index_list('${table}')`,
    ).all().map(({ name }) => name);

    assert.ok(indexesFor("users").some((name) => name.startsWith("sqlite_autoindex_users")));
    assert.ok(indexesFor("cars").includes("idx_cars_user_id"));
    assert.ok(indexesFor("services").includes("idx_services_car_id"));
    assert.ok(indexesFor("service_items").includes("idx_service_items_service_id"));
    assert.ok(indexesFor("sessions").includes("idx_sessions_user_id"));
    assert.ok(indexesFor("sessions").includes("idx_sessions_token_hash"));
  } finally {
    db.close();
  }
});

test("auth migration preserves existing users and data while removing passwords", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(migrations[0]);
  insertUserBeforeAuthMigration(db);
  insertCar(db);
  db.exec(migrations[1]);

  try {
    const user = db.prepare(
      "SELECT id, phone, first_name, last_name FROM users WHERE id = ?",
    ).get("user-1");
    const columns = db.prepare("PRAGMA table_info(users)").all();

    assert.equal(user.first_name, "Legacy name");
    assert.equal(user.last_name, null);
    assert.ok(!columns.some(({ name }) => name === "password_hash"));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cars").get().count, 1);
  } finally {
    db.close();
  }
});

function insertUserBeforeAuthMigration(db) {
  db.prepare(
    "INSERT INTO users (id, phone, password_hash, name) VALUES (?, ?, ?, ?)",
  ).run("user-1", "+989121234567", "legacy-hash", "Legacy name");
}
