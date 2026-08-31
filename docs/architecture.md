# Architecture principles and system map

This is an explanatory view of the [Software Factory architecture](https://app.notion.com/p/3cc433c39871816eade1c7e8b86af3c4), updated 2026-08-31. [AGENTS.md](../AGENTS.md) is the complete, injected system contract and contains every critical restriction. This document supplies human-oriented rationale and must not introduce requirements absent from `AGENTS.md`.

## Product shape

Factory moves tickets through declarative, git-versioned pipelines using specialized AI-agent roles. The default path is `todo → plan → execute → review → ship → done`, while pipelines configure roles, gates, WIP limits, bounce reasons, and retry limits.

A standalone Bun executable hosts the CLI, HTTP API, restartable orchestrator, SQLite store, importers, and embedded web UI. Hermes runs role profiles and sessions. herdr hosts disposable terminal workspaces. Moshi reaches those sessions from mobile over Tailscale. GitHub and Notion feed intake candidates and receive thin status write-back.

## Principles

### Durable truth has one home

Tickets and append-only transitions are authoritative. Heavy data stays elsewhere and is referenced: definitions in git, plans in files, PRs in the forge, and conversations in Hermes. A reboot rebuilds workspaces from tickets without guessing.

Each repository has one versioned SQLite database below the machine-wide `FACTORY_HOME`. Its directory key combines the repository name with a hash of its canonical path, preventing same-named repositories from sharing state. A cleanly stopped database is backed up by copying that single file.

### Coordination is a state-machine operation

The transition API is the sole validator of ownership, legal edges, entry gates, typed reasons, and attempt limits. Conversation may clarify an exception but cannot substitute for a recorded transition.

### Failures are data

Reason codes are stable control-flow inputs. Human notes explain details without becoming an API. Retries are explicit, bounded, and recorded.

### Backpressure emerges from claims

Roles pull work with atomic claims and renewable leases. State, role, pipeline, and machine limits constrain concurrency. Expired leases make crashes recoverable; priority and bounce ordering favor finishing work already in motion.

### History is immutable and reconstructible

Tickets freeze their pipeline and target-configuration commits at intake. New commits affect new tickets only. Git supplies history; the application does not invent pipeline migrations.

### Authority follows responsibility

Role toolsets and API tokens independently restrict capability. Tokens are ticket- and role-scoped. Human approval guards changes that could widen authority.

## Runtime boundaries

| Component | Durable responsibility | Adapter or projection |
| --- | --- | --- |
| State store | Tickets, transitions, claims, leases, artifact references | `bun:sqlite` implementation |
| Pipeline engine | Pinned definitions, validation, gates, limits | YAML and git resolver |
| Orchestrator | Reconciliation decisions | Hermes sessions, herdr Spaces, worktrees |
| Interfaces | Stable application operations | CLI, HTTP, HTML |
| Importers | Intake provenance and write-back intent | GitHub and Notion clients |
| Remote access | Private reachability and human interaction | Tailscale Serve and Moshi |

The core must be testable without real external programs. Subprocesses and remote APIs are adapters; acceptance tests put scripted fakes on `PATH` and use isolated repositories, databases, ports, and homes.

## Security posture

The network is tailnet-only by default, but Tailscale is transport, not application authorization. State changes still require edge-scoped tokens. Non-secret workspace markers locate a ticket and server; secrets arrive through the process environment. Teardown revokes tokens and removes disposable execution state.

## Excluded from v1

- Backlog grooming and maintenance
- Two-way synchronization with external trackers
- Multi-organization tenancy
- Live migration of in-flight pipeline definitions
- Cross-machine distribution of the Factory runtime

Adding one is an architectural change, not incidental implementation work.
