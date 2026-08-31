import type { Database } from "bun:sqlite";

const migrations = [
  `
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      kind TEXT NOT NULL,
      source_system TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      source_url TEXT,
      imported_at TEXT NOT NULL,
      imported_by TEXT NOT NULL,
      target_repository TEXT NOT NULL,
      base_branch TEXT NOT NULL,
      pipeline_name TEXT NOT NULL,
      pipeline_sha TEXT NOT NULL,
      target_config_sha TEXT NOT NULL,
      state TEXT NOT NULL,
      state_entered_at TEXT NOT NULL,
      assignee_role TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      blocked_question TEXT,
      blocked_raised_by TEXT,
      blocked_resumes_to TEXT,
      attempt_counts TEXT NOT NULL DEFAULT '{}' CHECK (
        json_valid(attempt_counts) AND json_type(attempt_counts) = 'object'
      ),
      workspace_space TEXT,
      workspace_worktree_path TEXT,
      workspace_branch TEXT
    ) STRICT;

    CREATE TABLE transitions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL REFERENCES tickets(id),
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT,
      note TEXT,
      hermes_session_id TEXT,
      idempotency_key TEXT NOT NULL,
      UNIQUE (ticket_id, idempotency_key),
      UNIQUE (ticket_id, sequence)
    ) STRICT;

    CREATE TRIGGER transitions_reject_update
    BEFORE UPDATE ON transitions
    BEGIN
      SELECT RAISE(ABORT, 'transitions are append-only');
    END;

    CREATE TRIGGER transitions_reject_replace
    BEFORE INSERT ON transitions
    WHEN EXISTS (
      SELECT 1
      FROM transitions
      WHERE sequence = NEW.sequence
         OR (ticket_id = NEW.ticket_id AND idempotency_key = NEW.idempotency_key)
    )
    BEGIN
      SELECT RAISE(ABORT, 'transitions are append-only');
    END;

    CREATE TRIGGER transitions_reject_delete
    BEFORE DELETE ON transitions
    BEGIN
      SELECT RAISE(ABORT, 'transitions are append-only');
    END;

    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id),
      transition_sequence INTEGER,
      type TEXT NOT NULL,
      reference TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      UNIQUE (ticket_id, type, reference),
      FOREIGN KEY (ticket_id, transition_sequence)
        REFERENCES transitions(ticket_id, sequence)
    ) STRICT;

    CREATE TABLE claims (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id),
      role TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      released_at TEXT
    ) STRICT;

    CREATE TABLE leases (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL UNIQUE REFERENCES claims(id),
      expires_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      revoked_at TEXT
    ) STRICT;
  `,
] as const;

export function migrateState(database: Database): void {
  const row = database.query<{ readonly user_version: number }, []>("PRAGMA user_version").get();
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion > migrations.length) {
    throw new Error(
      `State database schema version ${currentVersion} is newer than supported version ${migrations.length}`,
    );
  }

  database.transaction(() => {
    for (let index = currentVersion; index < migrations.length; index += 1) {
      const migration = migrations[index];
      if (migration === undefined) {
        throw new Error(`Missing state database migration ${index + 1}`);
      }
      database.exec(migration);
      database.exec(`PRAGMA user_version = ${index + 1}`);
    }
  })();
}
