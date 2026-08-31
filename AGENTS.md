# Factory agent system contract

This file is the authoritative, self-contained contract for every agent working in this repository. Agent harnesses inject `AGENTS.md` into the system prompt, so critical architecture and restrictions belong here—not only in conversational context, optional skills, or linked documentation.

Build Factory v1 for human maintainers who must understand, test, operate, and safely change it without the original implementation context.

## Authority and scope

Product sources:

- [Software Factory — Architecture](https://app.notion.com/p/3cc433c39871816eade1c7e8b86af3c4)
- [Coding Agent System Prompt — Building Factory v1, rev. 3](https://app.notion.com/p/3cd433c39871817bb3d2fd4b82c8c640)
- [Factory v1 — Roadmap](https://app.notion.com/p/1ff57c365edb41aabe83b3d9fc5bd277)

Before implementing a roadmap task, fetch its current Notion entry. Its user stories and dependency field define scope. Never start a task whose dependencies are unmerged. If this file, Notion, and executable behavior disagree, stop and surface the discrepancy rather than silently choosing one.

This repository implements backlog delivery. Backlog maintenance and grooming are separate and out of scope.

## Product definition

Factory is a ticket-driven state machine with specialized AI-agent roles as workers. Tickets move through a configurable pipeline; the default path is `todo → plan → execute → review → ship → done`.

One standalone Factory executable hosts the CLI, HTTP API, restartable orchestrator, embedded web UI, importers, and SQLite state store. Process definitions live in the repository under `.factory/`. Hermes runs durable role profiles and per-ticket sessions. herdr hosts disposable terminal workspaces. Moshi and Tailscale provide private mobile access. GitHub and Notion supply intake candidates and receive thin write-back.

## Six architectural invariants

Every design, implementation, test, and review must preserve all six:

1. **The ticket is truth.** SQLite tickets and their append-only transition logs are the durable system of record. Worktrees, herdr Spaces, Hermes sessions, chats, and dashboards are disposable projections that must be recreatable from tickets—never the reverse.
2. **Conversation is not coordination.** Agents advance work through validated state transitions, not direct messages. Agent-to-agent messaging is exceptional. Bounded deliberation must write its outcome back to the ticket.
3. **Typed reasons everywhere.** Every rejection, bounce, and failure has a declared machine-readable reason code. Agents and the orchestrator branch on codes; prose belongs in notes. Retry at most once and only for a failure class where retry can help.
4. **Pull, not push.** Roles atomically claim eligible work, hold leases, and heartbeat. Nothing pings an agent to act. Expired leases return work to the queue, making worker crashes recoverable.
5. **Pinning over migration.** Pipelines, roles, and templates live in git. A ticket pins the commit it entered under and never changes definitions in flight. New work uses new definitions; historical process remains reconstructible with git. A genuinely different pipeline requires cancellation and re-import.
6. **Capability separation is the safety model.** Each role receives only the tools and API edges its owned states require. Enforce authority both in Hermes toolsets and with per-ticket, per-role API tokens. Reviewers cannot push; builders cannot ship.

## System ownership

| System | Owns | Must not own |
| --- | --- | --- |
| Factory executable | CLI, API, orchestration, importers, embedded UI, SQLite persistence | Agent identity or terminal-session durability |
| Repository `.factory/` | Versioned pipelines, role specs, templates, repository configuration | Live ticket state |
| SQLite ticket store | Tickets, transitions, artifacts, claims, and leases | Large artifact payloads or process definitions |
| Target repositories | Product code and optional target-specific Factory configuration | Factory-wide live state |
| Hermes | Durable role profiles and per-ticket sessions | Pipeline coordination or authoritative ticket state |
| herdr | Disposable Spaces, tabs, panes, and agent-state projections | Durable workflow state |
| Moshi | Mobile interaction with herdr and blocked-agent events | Workflow state or credentials owned by Factory |
| Tailscale | Private network transport and `tailscale serve` exposure | Application authorization |
| GitHub and Notion | Intake candidates and thin write-back | Two-way workflow synchronization |

Domain decisions must not depend on transport, storage, UI, or subprocess details. SQLite, HTTP, CLI, Git, Hermes, herdr, GitHub, Notion, Moshi, and Tailscale sit behind explicit adapters. The factory-in-a-box harness replaces those boundaries with useful fakes.

## Ticket and transition model

A ticket contains:

- Identity: ULID `id`, `title`, `body`, and `kind`.
- Provenance: source system, reference, URL, import timestamp, and importer identity.
- Immutable intake binding: target repository, base branch, `pipeline: <name>@<sha>`, and target configuration SHA.
- Live state: denormalized current state, state-entry time, assignee role, priority, structured blocked record, and per-edge attempt counts.
- Nullable, recreatable workspace: herdr Space, worktree path, and branch.
- Typed artifact pointers such as `plan`, `pr`, `review`, and `release_note`; store references, not heavy payloads.
- Append-only transitions recording `from`, `to`, timestamp, actor, typed bounce reason, human note, artifacts, and Hermes session ID.

The transition log is the audit trail. From any hop, an operator must be able to reach the exact artifact and Hermes transcript that produced it.

### Transition API

`POST /v1/tickets/{id}/transitions` accepts `to`, required `from`, optional typed `reason`, note, artifacts, Hermes session, and an idempotency key.

Validate every write against the ticket's pinned pipeline revision:

- The edge exists.
- The caller's role owns the source state.
- The destination entry gate is satisfied.
- Bounce reasons are declared for that edge.
- Attempt limits are not exhausted.
- The supplied `from` still matches current state; stale writes return `409 stale_state`.

Stable typed rejection codes include `illegal_edge`, `not_owner`, `gate_unsatisfied`, `unknown_reason`, `attempts_exhausted`, and `stale_state`. Do not branch on prose or error strings.

### Claims and leases

`POST /v1/claims` accepts a role. The server atomically chooses eligible work by priority then age; bounced tickets sort ahead of fresh work. A successful claim returns a renewable lease with TTL. `204` means no eligible work or a reached limit.

The claim is the mutex. Two sessions of a role cannot claim the same ticket. Lease expiry returns the ticket to the queue.

## Pipelines and roles

Pipelines are declarative YAML under `.factory/`. A definition contains:

- States with owning role, optional entry gate, and WIP limit.
- Transitions, including bounce edges and their allowed reason codes.
- Roles with profile reference, toolset, model pin, and `max_concurrent`.
- Pipeline limits including `max_active_tickets` and `blocked_limit`.

Every pipeline includes a terminal done-class state and `blocked-on-human` with a recorded `resumes_to`; neither may be configured away. Every state must be reachable, every non-terminal state owned, every bounce edge typed, and every role toolset no broader than its owned states require. `factory lint` and CI reject invalid definitions.

Resolve definitions from the ticket's pinned revision using `git show <sha>:.factory/...`. Cache parsed definitions by SHA only when that cannot blur revisions. A commit on `main` affects new tickets, never active ones.

An optional target-repository configuration declares its default pipeline, build/test commands, protected branches, and repository-specific role hints. Tickets pin that target configuration SHA at intake.

Default roles:

| Role | Owns | Capability boundary | Required output |
| --- | --- | --- | --- |
| Planner | `todo → plan` | Read-only repository access | Plan artifact |
| Builder | `plan → execute` | Isolated worktree, edit and test | Pull request artifact |
| Reviewer | `execute → review/ship` | Read, test, and comment; cannot push | Review or typed bounce |
| Shipper | `ship → done` | Release, changelog, and monitoring actions | Release-note artifact |

A role is configuration: `.factory/roles/<name>/role.yaml` plus `SOUL.md`, skills, toolset, and model pin. Hermes profiles are durable identities; sessions are per-ticket engagements. Materialize profiles lazily from the ticket's pinned SHA so a role edit cannot mutate an active agent.

Every role has one goal: advance tickets from states it owns or bounce them with a typed reason. Every role can escalate through `factory block`, which creates a structured human question and parks the ticket in `blocked-on-human`.

## Runtime and orchestration

The orchestrator is stateless and restartable. Durable workflow state belongs only in SQLite. On startup it reads tickets and reconstructs required workspaces. A crash may interrupt an action but must not lose or invent pipeline state.

For a successful claim, the orchestrator:

1. Creates or repairs a `factory/<ticket-id>` worktree and branch.
2. Creates the corresponding herdr Space and role tab through the socket API.
3. Writes a non-secret workspace marker containing server address and ticket ID.
4. Mints a ticket-and-role-scoped token and injects it as `FACTORY_TOKEN`.
5. Launches the pinned Hermes role profile/session.

On terminal state or teardown it dismantles the disposable workspace and revokes credentials. On reboot it reconciles actual workspaces with ticket state.

External programs are resolved through `PATH` and invoked behind narrow interfaces. Tests interpose scripted `git`, `herdr`, and `hermes` executables. Do not embed machine-specific executable paths.

## CLI contract and context

The agent-facing surface stays small:

```text
factory transition <to> --from <state> [--reason <code>] [--note "…"] [--session hermes:<id>]
factory block "<question for the human>"
factory artifact add <type> <path>
factory ticket
factory claim
factory queue
factory heartbeat
factory init
factory up
factory doctor
factory lint
```

The CLI walks upward from its current directory to find committed `.factory/` configuration and the gitignored workspace marker. Agents never pass a ticket ID for workspace-scoped operations. Outside a materialized workspace, ticket-scoped commands fail loudly.

Identity comes only from `FACTORY_TOKEN` in the environment, never from the marker. `factory ticket` reports current state, unmet gates, and legal edges so agents query the pinned process instead of reasoning from memorized workflow.

## Work-in-progress and backpressure

Enforce limits at four levels:

- Per-state `wip_limit`.
- Per-role `max_concurrent` claims.
- Pipeline `max_active_tickets` and `blocked_limit`.
- Machine `max_spaces` under `FACTORY_HOME` configuration.

Claims check the destination state's capacity. This produces kanban pull and backpressure without a separate scheduler. `blocked-on-human` uses its own limit rather than consuming normal WIP. The UI must show saturation explicitly, such as `execute at limit 3/3`, rather than silently hiding queued work.

## UI, importers, and remote access

The embedded UI shares one port with the API and serves three operator needs:

- Kanban and ticket history, including WIP saturation and session links.
- The structured blocked-on-human queue and answer/resume flow.
- Intake, connector configuration, target registration, and template selection.

The UI is the phone's reading surface. The terminal is reserved for interaction that genuinely requires talking to an agent.

Importers are intake, not synchronization. Their boundary is equivalent to `list(filter): Candidate[]` plus `writeback(ticket, event)`. The human maps each candidate to a target and pipeline at intake. After ticket creation, connectors perform only thin status/comment/property write-back. Never build two-way reconciliation with external boards.

Moshi reaches herdr through SSH/Mosh over Tailscale. Blocked-agent events and deep links are disposable navigation aids, not state. Expose the UI/API through loopback and `tailscale serve`; never through Tailscale Funnel or the public internet.

## Approved technology

- TypeScript on Bun, one implementation language across CLI, daemon, API, test harness, and browser code.
- Standalone executables containing the Bun runtime and embedded web assets; operators do not need Bun installed.
- `bun:sqlite` with live state in a single external database under `FACTORY_HOME`, never in worktrees or embedded in the executable.
- Bun HTTP and Web-standard `Request`/`Response` primitives; no server framework by default.
- Semantic HTML and CSS with small browser-side TypeScript; no SPA framework by default.
- Strict TypeScript with `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Runtime validation for all HTTP, YAML, database, filesystem, environment, and subprocess inputs. Static types never replace boundary validation.

Changing the runtime, persistence choice, public API/schema, token model, capability boundary, or network exposure requires an explicit design case and Miguel's approval.

## Human-maintainable code

- Prefer the simplest design that makes ownership and failure modes obvious. Novelty must pay for itself.
- Use product vocabulary. Avoid vague `manager`, `util`, `helper`, and `service` modules when a domain name exists.
- Keep modules cohesive, dependency direction explicit, and exported APIs small. Introduce interfaces at substitution boundaries, not speculatively.
- Accept `unknown` at untrusted boundaries and validate before use. Do not use `any` to bypass a design problem.
- Make invalid states difficult to construct. Keep reason/error codes stable and separate from human notes.
- Keep Bun-specific filesystem, process, database, clock, and network behavior in adapters. Domain code should be deterministic and fast to test.
- Pass `AbortSignal` through cancellable work. Make time, IDs, roots, processes, and external clients controllable in tests.
- Prefer immutable data and explicit return values. Translate unexpected exceptions into typed failures at application boundaries.
- Keep functions readable as one idea without fragmenting linear code into indirection. Comments explain invariants and surprising tradeoffs, not syntax.
- Prefer explicit ordering, idempotent operations, and bounded retries.
- Add no dependency without documenting why Bun or a small local implementation is insufficient.
- Leave no TODO without a roadmap/task reference. Update user-facing documentation with user-facing behavior.

## Testability and outside-in TDD

Testability is a product requirement. `FACTORY_HOME` overrides all machine state and configuration. `--port 0` binds an ephemeral port and reports it. Tests share no state and run safely in parallel.

Every acceptance test follows one canonical factory-in-a-box shape:

1. **Arrange:** Create an ephemeral git repository with a committed `.factory/` fixture and initial SHA.
2. **Boot:** Start a real Factory instance against that repository with an isolated `FACTORY_HOME`, SQLite database, and ephemeral port.
3. **Act:** Drive the outermost available surface—HTTP before the CLI exists, CLI once it lands, and UI endpoints for UI tasks.
4. **Assert through tickets:** Verify tickets, states, transitions, actors, typed reasons/errors, artifacts, and attempt counts. Do not assert on internals when ticket behavior expresses the same contract.

For each roadmap task, work in vertical red-green-refactor slices:

1. Write one failing acceptance test for a user-visible behavior and run it to confirm the expected failure.
2. Write the smallest implementation that makes it pass.
3. Add focused unit tests only while driving internal design or edge cases.
4. Refactor with all tests green.
5. Repeat for the next behavior.

Use useful in-memory or scripted fakes, not mock-expectation frameworks. Contract-test real adapters separately; a test may skip only when its external dependency is absent and the skip explains why. Never delete, weaken, or rewrite a failing test merely to obtain green CI.

## Task workflow and review

One roadmap task equals one branch (`task/<nn>-<slug>`) and one PR. Respect dependencies and keep the PR scoped. Flag incidental refactors as separate commits.

Every PR description includes:

- Task number/name and user stories served.
- Acceptance tests and exact commands.
- Design decisions and rejected alternatives.
- Honest uncertainties and untested behavior.

Blind review uses a fresh agent session with only this contract, the roadmap task, PR description, and diff. It runs the suite and verifies the acceptance test is at the outermost available surface, asserts through tickets, would fail without the change, and preserves all invariants.

Review verdicts are `approve` or `request_changes`. Reasons are `spec_mismatch`, `invariant_violation`, `insufficient_tests`, `wrong_test_level`, `scope_creep`, `design_concern`, or non-blocking `style`.

Allow at most three review rounds. If round three still requests changes, stop and escalate to Miguel with a neutral joint summary of at most 200 words. Do not merge or continue the argument.

On approval, squash-merge with the task number. Keep `main` green. Done means:

- The task's user stories are demonstrated by factory-in-a-box acceptance tests.
- The full suite is green and parallel-safe.
- `bun test`, typecheck, and the configured linter are clean.
- Standalone packaging is smoke-tested when affected.
- No unexplained skipped tests or unreferenced TODOs remain.
- User-facing documentation reflects changed behavior.

## Security and escalation

- State-changing requests use optimistic concurrency and idempotency keys.
- `FACTORY_TOKEN` is scoped to one ticket and role, injected through the environment, and revoked at teardown.
- Workspace markers contain no secrets.
- Tailscale is transport, not application authorization. Bind to loopback or tailnet by default.
- Never expose terminal control, UI, or API through a public listener or Tailscale Funnel.
- Target-repository credentials are granted per registered product.
- Human approval is hardwired for changes to role toolsets or other capability-widening configuration.
- Stop and ask when ambiguity changes architecture, public contracts, capabilities, credentials, schema, dependencies, or network exposure.

## Roadmap order

Implement in priority order unless listed dependencies allow safe parallel work:

| # | Task | Depends on |
| --- | --- | --- |
| 1 | Binary scaffold, CI, and release pipeline | — |
| 1.5 | Factory-in-a-box acceptance harness | 1 |
| 2 | SQLite schema and migrations | 1 |
| 3 | Pipeline schema, parser, and `factory lint` | 1 |
| 4 | Git SHA-pinning resolver | 3 |
| 5 | HTTP server and edge-scoped token auth | 2 |
| 6 | Transition endpoint with typed validation | 3, 4, 5 |
| 7 | Ticket read API: state, gates, legal edges | 6 |
| 8 | Claims, leases, WIP limits, heartbeat—walking skeleton | 6 |
| 9 | CLI context resolution | 5 |
| 10 | CLI transition, block, artifact, ticket | 7, 9 |
| 11 | CLI claim, queue, heartbeat | 8, 9 |
| 12 | Worktree lifecycle manager | 2 |
| 13 | herdr socket integration | 12 |
| 14 | Lazy SHA-pinned Hermes profile materializer | 4 |
| 15 | Orchestrator loop and crash recovery | 8, 12, 13, 14 |
| 16 | Role contract injection | 10, 14 |
| 17 | Default role pack—first autonomous ticket | 16 |
| 18 | Default, bugfix-fastlane, and solo-mode templates | 3 |
| 19 | `factory init` and `factory doctor` | 18 |
| 20 | Embedded web UI and kanban | 7 |
| 21 | Blocked-on-human queue and answer flow | 20 |
| 22 | GitHub importer and write-back | 2 |
| 23 | Intake and mapping UI | 20, 22 |
| 24 | Notion importer | 22, 23 |
| 25 | Tailscale Serve and Moshi flow | 15, 21 |
| 26 | Human gate for role-toolset changes | 15 |

Milestones: after task 8, the full pipeline is drivable over HTTP in the harness. After task 17, a ticket flows autonomously from `todo` to `done` against scripted Hermes/herdr fakes and is manually verified with the real tools. Task 27 begins dogfooding; the Factory then ships its own backlog.

## Explicitly out of scope for v1

- Backlog maintenance and grooming.
- Two-way synchronization with external trackers.
- Multi-organization tenancy.
- Live mutation or migration of active tickets' pipeline definitions.
- Cross-machine distribution of the Factory runtime.

Adding any of these is an architectural decision, not incidental implementation work.

## External skills and documentation

Use the installed specialized skills for herdr, Hermes, Tailscale, Moshi, frontend design, web-app testing, TDD, and code review when their surfaces are in scope. Verify external behavior against the pinned dependency version or current official documentation. Never rely on remembered APIs.
