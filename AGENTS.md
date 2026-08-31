# Factory agent working agreement

Build Factory v1 from the architecture and roadmap below. Optimize for human maintainers who must understand, test, and safely change the system without the original implementation context.

## Product sources

- [Software Factory — Architecture](https://app.notion.com/p/3cc433c39871816eade1c7e8b86af3c4)
- [Coding Agent System Prompt — Building Factory v1, rev. 3](https://app.notion.com/p/3cd433c39871817bb3d2fd4b82c8c640)
- [Factory v1 — Roadmap](https://app.notion.com/p/1ff57c365edb41aabe83b3d9fc5bd277)

Fetch the relevant roadmap entry before starting a task. Its user stories and dependencies define scope. If repository guidance disagrees with Notion, stop and surface the discrepancy.

## Architectural invariants

Every design and review preserves all six:

1. **The ticket is truth.** SQLite tickets and append-only transitions are the durable system of record. Worktrees, herdr Spaces, Hermes sessions, chats, and dashboards are recreatable projections.
2. **Conversation is not coordination.** Agents advance work through validated transitions. Exceptional deliberation is bounded and writes its outcome back to the ticket.
3. **Typed reasons everywhere.** Rejections, bounces, and failures carry declared machine-readable codes. Prose belongs in notes. Retry at most once and only when it can help.
4. **Pull, not push.** Roles atomically claim eligible work, hold leases, and heartbeat. Expired leases return work to the queue.
5. **Pinning over migration.** Pipelines and roles live in git. Tickets pin the commit they entered under and never change definitions in flight.
6. **Capability separation is the safety model.** Runtime toolsets and per-ticket, per-role API tokens independently enforce authority. Reviewers cannot push; builders cannot ship.

## Boundaries

The Bun executable is one entrypoint and process: CLI, HTTP server, restartable orchestrator, embedded UI, importers, and SQLite. Hermes, herdr, Moshi, and Tailscale remain managed dependencies or external surfaces.

- Domain modules own tickets, transitions, gates, claims, leases, WIP rules, and typed errors.
- SQLite persists records but does not define domain behavior.
- HTTP and CLI translate inputs and outputs; both call the same application operations.
- Bun, Git, Hermes, herdr, GitHub, Notion, and Tailscale APIs sit behind narrow adapters with useful fakes.
- The orchestrator repairs disposable workspaces from tickets. It never infers authoritative state from terminal sessions.
- Importers perform intake and thin write-back, never two-way synchronization.

Read [docs/architecture.md](docs/architecture.md) and use the repository-local `factory-architecture` skill when a change crosses a boundary.

## Approved technology

- TypeScript on Bun, packaged as standalone executables.
- `bun:sqlite`, with live state outside worktrees under `FACTORY_HOME`.
- Bun HTTP and Web-standard request/response primitives; no web framework by default.
- Semantic HTML and CSS with small browser-side TypeScript; no SPA framework by default.
- External programs resolved through `PATH` and called through injected adapters.
- Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

Changing the runtime, persistence choice, public API/schema, token model, capability boundary, or network exposure requires an explicit design case and Miguel's approval.

## Human-maintainable code

- Prefer the simplest design that makes ownership and failure modes obvious. Novelty must pay for itself.
- Use product vocabulary. Avoid vague `manager`, `util`, `helper`, and `service` modules when a domain name exists.
- Keep modules cohesive, dependency direction explicit, and exported APIs small. Introduce interfaces at substitution boundaries, not speculatively.
- Accept `unknown` at untrusted boundaries and validate before use. Do not use `any` to bypass a design problem.
- Make invalid states difficult to construct. Keep typed reason/error codes stable and separate from human notes.
- Keep Bun-specific filesystem, process, database, clock, and network behavior in adapters. Domain code should be deterministic and fast to test.
- Pass `AbortSignal` through cancellable work. Make time, IDs, roots, processes, and external clients controllable in tests.
- Prefer immutable data and explicit return values. Use exceptions only across boundaries that immediately translate them into typed failures.
- Keep functions readable as one idea without fragmenting linear code into indirection. Comments explain invariants and surprising tradeoffs, not syntax.
- Prefer deterministic ordering, idempotent operations, and bounded retries.
- Add no dependency without explaining why the platform or a small local implementation is insufficient.
- Leave no TODO without a roadmap/task reference. Update user-facing docs with user-facing behavior.

## Outside-in delivery

One roadmap task equals one branch (`task/<nn>-<slug>`) and one PR. Work in priority order; do not begin work whose dependencies are unmerged.

For every task:

1. Re-read its user stories and the six invariants.
2. Write a failing factory-in-a-box acceptance test at the outermost public surface available.
3. Arrange an ephemeral git repository with committed `.factory/` fixtures and an isolated `FACTORY_HOME`; boot on an ephemeral port.
4. Drive through CLI when it exists, otherwise HTTP, and through UI endpoints for UI stories.
5. Assert through tickets, transitions, typed errors, artifacts, and attempt counts. Avoid internal assertions when ticket behavior expresses the contract.
6. Use focused unit tests to grow internals and useful fakes for subprocesses and external APIs.
7. Make the acceptance test green last, then refactor without weakening it.

Tests must be parallel-safe. Real-adapter contract tests may skip only when the dependency is absent and the skip states why. Never delete or dilute a failing test merely to obtain green CI.

## Review and completion

PRs state the roadmap task and user stories, acceptance tests and commands, design decisions and rejected alternatives, and honest uncertainties. A fresh session performs blind review from the task, this agreement, the PR description, and the diff.

Review verdicts are `approve` or `request_changes` using `spec_mismatch`, `invariant_violation`, `insufficient_tests`, `wrong_test_level`, `scope_creep`, `design_concern`, or non-blocking `style`. After three unresolved review rounds, stop and escalate with a neutral summary of at most 200 words.

Done means acceptance tests and the full suite pass, tests are parallel-safe, `bun test`, typecheck, and the configured linter are clean, standalone packaging is smoke-tested when affected, and each user story is demonstrated by a test. Keep `main` green and squash-merge with the task number.

## Security and escalation

- State-changing HTTP calls use optimistic concurrency and idempotency keys.
- Tokens are scoped to one ticket and role, injected through `FACTORY_TOKEN`, and revoked at teardown. Workspace markers contain no secrets.
- Bind UI/API to loopback or tailnet by default. Never expose terminal control or application surfaces publicly.
- Human approval is mandatory for changes to role toolsets.
- Stop and ask when ambiguity changes architecture, public contracts, capabilities, credentials, schema, or network exposure.

## Skills

Use `factory-architecture` for repository changes. User-level skills are available for herdr, Hermes, Tailscale, Moshi, frontend design, web-app testing, TDD, and code review. Use current official documentation when touching an external surface; never rely on remembered APIs.
