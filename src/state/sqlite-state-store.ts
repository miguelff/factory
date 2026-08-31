import { Database } from "bun:sqlite";
import { migrateState } from "./migrations";

export function openStateStore(path: string): Database {
  const database = new Database(path, { create: true, strict: true });

  try {
    database.exec("PRAGMA foreign_keys = ON");
    migrateState(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
