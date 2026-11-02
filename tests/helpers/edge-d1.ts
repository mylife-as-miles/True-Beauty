import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type {
  HostedD1,
  D1Statement,
  D1Result,
} from "../../apps/edge/src/runtime/contracts";

/** Real SQLite statement/trigger/transaction fixture; not a mock of the store logic. */
export function createEdgeD1Fixture(path = ":memory:") {
  const sql = new DatabaseSync(path);
  for (const file of readdirSync(resolve("drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync(resolve("drizzle", file), "utf8"));
  class Statement implements D1Statement {
    constructor(
      readonly query: string,
      readonly values: Array<string | number | null> = [],
    ) {}
    bind(...values: Array<string | number | null>) {
      return new Statement(this.query, values);
    }
    async first<T = Record<string, unknown>>() {
      return (sql.prepare(this.query).get(...this.values) ?? null) as T | null;
    }
    async all<T = Record<string, unknown>>() {
      return { results: sql.prepare(this.query).all(...this.values) as T[] };
    }
    runSync(): D1Result {
      const result = sql.prepare(this.query).run(...this.values);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
    async run() {
      return this.runSync();
    }
  }
  const db: HostedD1 = {
    prepare: (query) => new Statement(query),
    batch: async (statements) => {
      sql.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) =>
          (statement as Statement).runSync(),
        );
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sql, close: () => sql.close() };
}
