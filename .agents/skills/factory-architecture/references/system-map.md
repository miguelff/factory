# Factory system map

Source: [Software Factory — Architecture](https://app.notion.com/p/3cc433c39871816eade1c7e8b86af3c4), updated 2026-08-31.

| System | Owns | Must not own |
| --- | --- | --- |
| Factory executable | CLI, HTTP API, orchestration, importers, embedded UI, SQLite persistence | Agent identity or terminal-session durability |
| Repository `.factory/` | Versioned pipelines, roles, templates, repository configuration | Live ticket state |
| SQLite ticket store | Tickets, transitions, artifacts, claims, leases | Large artifact payloads or process definitions |
| Hermes | Durable role profiles and per-ticket sessions | Pipeline coordination or authoritative ticket state |
| herdr | Disposable Spaces, tabs, panes, and agent-state projections | Durable workflow state |
| Moshi | Mobile interaction with herdr and blocked-agent events | Workflow state or public network exposure |
| Tailscale | Private transport and `tailscale serve` exposure | Application authorization |
| GitHub and Notion | Intake candidates and thin write-back | Two-way workflow synchronization |

Domain state and validation must not depend on transport, storage, UI, or subprocess details. HTTP, CLI, SQLite, Git, Hermes, herdr, GitHub, Notion, Moshi, and Tailscale sit behind explicit boundaries. The factory-in-a-box harness replaces processes and APIs with useful fakes.

The orchestrator is restartable. It derives workspaces from tickets, never reconstructs tickets from herdr or Hermes, and loses no durable workflow information when it exits.

## Versioning and context

- A ticket freezes its target repository/base branch, pipeline name and commit SHA, and target configuration SHA at intake.
- Resolve process definitions with git at the pinned revision.
- Workspace markers identify factory address and ticket only; credentials arrive through `FACTORY_TOKEN`.
- State-changing requests use optimistic concurrency and idempotency keys.
- Role tokens are scoped to one ticket and the edges owned by that role, then revoked at teardown.

Use the installed `herdr`, `hermes-agent`, `tailscale`, and `moshi` skills for implementation details. Verify external APIs against the pinned dependency version or current official documentation before coding an adapter.
