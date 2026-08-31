import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { newFactoryRepo, startFactory } from "../support/factory-in-a-box";

const acceptanceTimeout = 15_000;

test("Factory boot initializes the versioned ticket state schema", async () => {
  const repo = await newFactoryRepo();

  try {
    const factory = await startFactory(repo);

    try {
      const database = new Database(factory.statePath, { readonly: true });

      try {
        const tables = database
          .query<{ readonly name: string }, []>(
            "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all()
          .map(({ name }) => name);

        expect(tables).toEqual(["artifacts", "claims", "leases", "tickets", "transitions"]);
        expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
      } finally {
        database.close();
      }
    } finally {
      expect(await factory.stop()).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await repo.remove();
  }
}, acceptanceTimeout);

test("Factory recovers a ticket and its audit trail after a restart", async () => {
  const repo = await newFactoryRepo();
  const factoryHome = await mkdtemp(join(tmpdir(), "factory-state-"));

  try {
    const firstRun = await startFactory(repo, { factoryHome });
    const database = new Database(firstRun.statePath, { strict: true });

    try {
      insertTicket(database, repo.root, repo.initialSha);
      insertTransition(database);
    } finally {
      database.close();
      expect(await firstRun.stop()).toEqual({ exitCode: 0, stderr: "" });
    }

    const secondRun = await startFactory(repo, { factoryHome });

    try {
      const recovered = new Database(secondRun.statePath, { readonly: true, strict: true });

      try {
        expect(
          recovered
            .query(
              `SELECT t.id, t.state, t.pipeline_name, t.pipeline_sha,
                      x.from_state, x.to_state, x.actor, x.note, x.hermes_session_id
               FROM tickets AS t
               JOIN transitions AS x ON x.ticket_id = t.id`,
            )
            .get(),
        ).toEqual({
          id: "01K4FACTORY000000000000001",
          state: "plan",
          pipeline_name: "default",
          pipeline_sha: repo.initialSha,
          from_state: "todo",
          to_state: "plan",
          actor: "planner",
          note: "Plan attached",
          hermes_session_id: "hermes:session-1",
        });
      } finally {
        recovered.close();
      }
    } finally {
      expect(await secondRun.stop()).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await rm(factoryHome, { force: true, recursive: true });
    await repo.remove();
  }
}, acceptanceTimeout);

test("Factory uses one ticket store when launched from nested repository directories", async () => {
  const repo = await newFactoryRepo();
  const factoryHome = await mkdtemp(join(tmpdir(), "factory-state-"));
  const nestedDirectory = join(repo.root, "packages", "worker");
  await mkdir(nestedDirectory, { recursive: true });

  try {
    const rootRun = await startFactory(repo, { factoryHome });
    const database = new Database(rootRun.statePath, { strict: true });

    try {
      insertTicket(database, repo.root, repo.initialSha);
    } finally {
      database.close();
      expect(await rootRun.stop()).toEqual({ exitCode: 0, stderr: "" });
    }

    const nestedRun = await startFactory(repo, {
      factoryHome,
      launchDirectory: nestedDirectory,
    });

    try {
      expect(nestedRun.statePath).toBe(rootRun.statePath);

      const recovered = new Database(nestedRun.statePath, { readonly: true, strict: true });
      try {
        expect(recovered.query("SELECT id, state FROM tickets").get()).toEqual({
          id: "01K4FACTORY000000000000001",
          state: "plan",
        });
      } finally {
        recovered.close();
      }
    } finally {
      expect(await nestedRun.stop()).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await rm(factoryHome, { force: true, recursive: true });
    await repo.remove();
  }
}, acceptanceTimeout);

test("Factory preserves transition history as an append-only audit trail", async () => {
  const repo = await newFactoryRepo();

  try {
    const factory = await startFactory(repo);

    try {
      const database = new Database(factory.statePath, { strict: true });

      try {
        insertTicket(database, repo.root, repo.initialSha);
        insertTransition(database);

        expect(() =>
          database.run(
            "UPDATE transitions SET note = 'rewritten' WHERE idempotency_key = 'transition-1'",
          ),
        ).toThrow("transitions are append-only");
        expect(() =>
          database.run("DELETE FROM transitions WHERE idempotency_key = 'transition-1'"),
        ).toThrow("transitions are append-only");
        expect(database.query("SELECT note FROM transitions").get()).toEqual({
          note: "Plan attached",
        });
      } finally {
        database.close();
      }
    } finally {
      expect(await factory.stop()).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await repo.remove();
  }
}, acceptanceTimeout);

test("Factory rejects replacing an existing transition through a conflicting insert", async () => {
  const repo = await newFactoryRepo();

  try {
    const factory = await startFactory(repo);

    try {
      const database = new Database(factory.statePath, { strict: true });

      try {
        insertTicket(database, repo.root, repo.initialSha);
        insertTransition(database);

        expect(() =>
          database.run(
            `INSERT OR REPLACE INTO transitions (
              ticket_id, from_state, to_state, occurred_at, actor,
              reason, note, hermes_session_id, idempotency_key
            ) VALUES (
              '01K4FACTORY000000000000001', 'todo', 'plan',
              '2026-08-31T12:05:00.000Z', 'planner', NULL,
              'rewritten', 'hermes:session-1', 'transition-1'
            )`,
          ),
        ).toThrow("transitions are append-only");
        expect(database.query("SELECT sequence, note FROM transitions").all()).toEqual([
          { sequence: 1, note: "Plan attached" },
        ]);
      } finally {
        database.close();
      }
    } finally {
      expect(await factory.stop()).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await repo.remove();
  }
}, acceptanceTimeout);

test("an artifact cannot point at another ticket's transition", async () => {
  const repo = await newFactoryRepo();

  try {
    const factory = await startFactory(repo);

    try {
      const database = new Database(factory.statePath, { strict: true });

      try {
        database.exec("PRAGMA foreign_keys = ON");
        insertTicket(database, repo.root, repo.initialSha);
        insertTransition(database);
        database.run(
          `INSERT INTO tickets
           SELECT '01K4FACTORY000000000000002', title, body, kind,
                  source_system, 'FCT-OTHER', source_url, imported_at, imported_by,
                  target_repository, base_branch, pipeline_name, pipeline_sha, target_config_sha,
                  state, state_entered_at, assignee_role, priority,
                  blocked_question, blocked_raised_by, blocked_resumes_to, attempt_counts,
                  workspace_space, workspace_worktree_path, workspace_branch
           FROM tickets
           WHERE id = '01K4FACTORY000000000000001'`,
        );

        expect(() =>
          database.run(
            `INSERT INTO artifacts (
              id, ticket_id, transition_sequence, type, reference, created_at, created_by
            ) VALUES (
              'artifact-cross-ticket', '01K4FACTORY000000000000002', 1,
              'plan', 'plans/wrong-ticket.md', '2026-08-31T12:07:00.000Z', 'planner'
            )`,
          ),
        ).toThrow("FOREIGN KEY constraint failed");
      } finally {
        database.close();
      }
    } finally {
      expect(await factory.stop()).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await repo.remove();
  }
}, acceptanceTimeout);

test("Factory recovers ticket artifacts, claims, leases, and workspace state", async () => {
  const repo = await newFactoryRepo();
  const factoryHome = await mkdtemp(join(tmpdir(), "factory-state-"));

  try {
    const firstRun = await startFactory(repo, { factoryHome });
    const database = new Database(firstRun.statePath, { strict: true });

    try {
      insertTicket(database, repo.root, repo.initialSha);
      insertTransition(database);
      database
        .query<never, Record<string, string>>(
          `UPDATE tickets
           SET state = 'blocked-on-human',
               blocked_question = 'Which release channel?',
               blocked_raised_by = 'builder',
               blocked_resumes_to = 'execute',
               workspace_space = 'factory-FCT-2',
               workspace_worktree_path = $worktree,
               workspace_branch = 'factory/01K4FACTORY000000000000001'
           WHERE id = '01K4FACTORY000000000000001'`,
        )
        .run({ worktree: join(repo.root, ".worktrees", "FCT-2") });
      database.run(
        `INSERT INTO artifacts (
          id, ticket_id, transition_sequence, type, reference, created_at, created_by
        ) VALUES (
          'artifact-1', '01K4FACTORY000000000000001',
          (SELECT sequence FROM transitions WHERE idempotency_key = 'transition-1'),
          'plan', 'plans/FCT-2.md', '2026-08-31T12:04:00.000Z', 'planner'
        )`,
      );
      database.run(
        `INSERT INTO claims (id, ticket_id, role, claimed_at, released_at)
         VALUES (
           'claim-1', '01K4FACTORY000000000000001', 'builder',
           '2026-08-31T12:06:00.000Z', NULL
         )`,
      );
      database.run(
        `INSERT INTO leases (id, claim_id, expires_at, heartbeat_at, revoked_at)
         VALUES (
           'lease-1', 'claim-1', '2026-08-31T12:11:00.000Z',
           '2026-08-31T12:06:00.000Z', NULL
         )`,
      );
    } finally {
      database.close();
      expect(await firstRun.stop()).toEqual({ exitCode: 0, stderr: "" });
    }

    const secondRun = await startFactory(repo, { factoryHome });

    try {
      const recovered = new Database(secondRun.statePath, { readonly: true, strict: true });

      try {
        expect(
          recovered
            .query(
              `SELECT t.state, t.blocked_question, t.blocked_raised_by, t.blocked_resumes_to,
                      t.workspace_space, t.workspace_worktree_path, t.workspace_branch,
                      a.type AS artifact_type, a.reference AS artifact_reference,
                      c.role AS claim_role, l.expires_at AS lease_expires_at
               FROM tickets AS t
               JOIN artifacts AS a ON a.ticket_id = t.id
               JOIN claims AS c ON c.ticket_id = t.id
               JOIN leases AS l ON l.claim_id = c.id`,
            )
            .get(),
        ).toEqual({
          state: "blocked-on-human",
          blocked_question: "Which release channel?",
          blocked_raised_by: "builder",
          blocked_resumes_to: "execute",
          workspace_space: "factory-FCT-2",
          workspace_worktree_path: join(repo.root, ".worktrees", "FCT-2"),
          workspace_branch: "factory/01K4FACTORY000000000000001",
          artifact_type: "plan",
          artifact_reference: "plans/FCT-2.md",
          claim_role: "builder",
          lease_expires_at: "2026-08-31T12:11:00.000Z",
        });
      } finally {
        recovered.close();
      }
    } finally {
      expect(await secondRun.stop()).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await rm(factoryHome, { force: true, recursive: true });
    await repo.remove();
  }
}, acceptanceTimeout);

test("repositories sharing FACTORY_HOME keep isolated ticket stores", async () => {
  const firstRepo = await newFactoryRepo();
  const secondRepo = await newFactoryRepo();
  const factoryHome = await mkdtemp(join(tmpdir(), "factory-state-"));

  try {
    const firstFactory = await startFactory(firstRepo, { factoryHome });
    const firstDatabase = new Database(firstFactory.statePath, { strict: true });

    try {
      insertTicket(firstDatabase, firstRepo.root, firstRepo.initialSha);
    } finally {
      firstDatabase.close();
      expect(await firstFactory.stop()).toEqual({ exitCode: 0, stderr: "" });
    }

    const secondFactory = await startFactory(secondRepo, { factoryHome });

    try {
      expect(secondFactory.statePath).not.toBe(firstFactory.statePath);

      const secondDatabase = new Database(secondFactory.statePath, { readonly: true });
      try {
        expect(secondDatabase.query("SELECT count(*) AS count FROM tickets").get()).toEqual({
          count: 0,
        });
      } finally {
        secondDatabase.close();
      }
    } finally {
      expect(await secondFactory.stop()).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await rm(factoryHome, { force: true, recursive: true });
    await Promise.all([firstRepo.remove(), secondRepo.remove()]);
  }
}, acceptanceTimeout);

test("an operator can back up repository state by copying one file", async () => {
  const repo = await newFactoryRepo();
  const factoryHome = await mkdtemp(join(tmpdir(), "factory-state-"));

  try {
    const factory = await startFactory(repo, { factoryHome });
    const database = new Database(factory.statePath, { strict: true });

    try {
      insertTicket(database, repo.root, repo.initialSha);
      insertTransition(database);
    } finally {
      database.close();
      expect(await factory.stop()).toEqual({ exitCode: 0, stderr: "" });
    }

    expect(await readdir(dirname(factory.statePath))).toEqual(["state.db"]);

    const backupPath = join(factoryHome, "state-backup.db");
    await copyFile(factory.statePath, backupPath);
    const backup = new Database(backupPath, { readonly: true, strict: true });

    try {
      expect(
        backup
          .query(
            `SELECT t.id, t.state, x.from_state, x.to_state
             FROM tickets AS t
             JOIN transitions AS x ON x.ticket_id = t.id`,
          )
          .get(),
      ).toEqual({
        id: "01K4FACTORY000000000000001",
        state: "plan",
        from_state: "todo",
        to_state: "plan",
      });
    } finally {
      backup.close();
    }
  } finally {
    await rm(factoryHome, { force: true, recursive: true });
    await repo.remove();
  }
}, acceptanceTimeout);

function insertTicket(database: Database, repository: string, revision: string): void {
  database
    .query<never, Record<string, string | number | null>>(
      `INSERT INTO tickets (
        id, title, body, kind,
        source_system, source_reference, source_url, imported_at, imported_by,
        target_repository, base_branch, pipeline_name, pipeline_sha, target_config_sha,
        state, state_entered_at, assignee_role, priority, attempt_counts
      ) VALUES (
        $id, $title, $body, $kind,
        $sourceSystem, $sourceReference, $sourceUrl, $importedAt, $importedBy,
        $targetRepository, $baseBranch, $pipelineName, $pipelineSha, $targetConfigSha,
        $state, $stateEnteredAt, $assigneeRole, $priority, $attemptCounts
      )`,
    )
    .run({
      id: "01K4FACTORY000000000000001",
      title: "Keep the audit trail",
      body: "Persist every state change.",
      kind: "feature",
      sourceSystem: "notion",
      sourceReference: "FCT-2",
      sourceUrl: "https://example.invalid/FCT-2",
      importedAt: "2026-08-31T12:00:00.000Z",
      importedBy: "human:miguel",
      targetRepository: repository,
      baseBranch: "main",
      pipelineName: "default",
      pipelineSha: revision,
      targetConfigSha: revision,
      state: "plan",
      stateEnteredAt: "2026-08-31T12:05:00.000Z",
      assigneeRole: "builder",
      priority: 2,
      attemptCounts: '{"todo:plan":1}',
    });
}

function insertTransition(database: Database): void {
  database
    .query<never, Record<string, string | null>>(
      `INSERT INTO transitions (
        ticket_id, from_state, to_state, occurred_at, actor,
        reason, note, hermes_session_id, idempotency_key
      ) VALUES (
        $ticketId, $fromState, $toState, $occurredAt, $actor,
        $reason, $note, $session, $idempotencyKey
      )`,
    )
    .run({
      ticketId: "01K4FACTORY000000000000001",
      fromState: "todo",
      toState: "plan",
      occurredAt: "2026-08-31T12:05:00.000Z",
      actor: "planner",
      reason: null,
      note: "Plan attached",
      session: "hermes:session-1",
      idempotencyKey: "transition-1",
    });
}
