import { DatabaseSync } from "node:sqlite";

function createD1Database(migrations) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => sqlite.exec(migration));

  function prepare(sql, values = []) {
    const statement = sqlite.prepare(sql);
    return {
      bind(...boundValues) {
        return prepare(sql, boundValues);
      },
      async first(column) {
        const row = statement.get(...values) || null;
        return column && row ? row[column] : row;
      },
      async run() {
        const result = statement.run(...values);
        return {
          success: true,
          meta: { changes: Number(result.changes) },
        };
      },
      async all() {
        const results = statement.all(...values);
        return { success: true, results };
      },
    };
  }

  return {
    db: { prepare },
    sqlite,
  };
}

export { createD1Database };
