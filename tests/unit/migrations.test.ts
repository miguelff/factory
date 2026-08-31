import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { migrateState } from "../../src/state/migrations";

test("migration runner rejects a database from a newer Factory version", () => {
  const database = new Database(":memory:", { strict: true });

  try {
    database.exec("PRAGMA user_version = 2");

    expect(() => migrateState(database)).toThrow(
      "State database schema version 2 is newer than supported version 1",
    );
  } finally {
    database.close();
  }
});
