---
name: factory-architecture
description: Implement or review Software Factory code, pipeline definitions, role contracts, tests, and integrations while preserving its ticket-driven architecture. Use for work in this repository; do not use as generic workflow-engine guidance.
---

# Factory architecture

Read the repository-root `AGENTS.md` before changing code. It is the working agreement. Read `docs/architecture.md` when a change crosses a component boundary.

Fetch the current roadmap entry from Notion before implementing it. Its user stories and dependencies define scope; do not start an item whose dependencies are unmerged.

## Decision test

Check every design against these invariants:

1. Tickets and their append-only transitions are durable truth.
2. State transitions, not conversations, coordinate workers.
3. Failures, bounces, and rejections have typed reason codes.
4. Workers atomically pull leased work; the orchestrator does not push it.
5. Tickets pin git revisions; in-flight definitions are not migrated.
6. Runtime toolsets and API authorization both enforce capability separation.

Prefer an explicit design a human can debug from a ticket and its transition history. Keep domain decisions independent of SQLite, HTTP, subprocesses, and templates. Adapters must remain narrow and fakeable.

## Delivery contract

Start each roadmap item with an outside-in factory-in-a-box acceptance test. Drive the outermost public surface available and assert observable behavior through tickets. Use unit tests to grow the internal design. Do not weaken a failing acceptance test to make an implementation pass.

TypeScript on Bun is approved. Use strict types, validate `unknown` data at every boundary, and isolate Bun APIs in adapters. Escalate before changing a security boundary, capability model, public API or schema contract, or the approved runtime.

For system ownership and integration boundaries, read [references/system-map.md](references/system-map.md).
