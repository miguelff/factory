---
name: kickoff
description: Finish a reviewed roadmap ticket and begin the next eligible one with GitHub and the project tracker kept in sync. Use when Miguel invokes /kickoff or asks to merge or close the current work and move on to the next ticket. Do not use for unrelated greenfield work or a request that only asks for status.
---

# Kickoff

Carry one ticket cleanly across the user-validation boundary, then start the next without losing repository or tracker context.

## Working agreement

- Read the repository's injected `AGENTS.md` before acting. It is the durable architecture and workflow authority.
- One roadmap ticket maps to one task branch and one pull request.
- Before merge, give Miguel a concrete way to exercise the behavior and leave the PR open for his validation.
- Never infer permission to merge from approval, green checks, or a request to inspect the next task. Merge only when Miguel explicitly authorizes it.
- Preserve uncommitted user work and unrelated changes. Never use destructive Git recovery to make the workflow fit.

## Close the current ticket

When merge is authorized:

1. Confirm the intended PR is open, mergeable, independently approved when the repository requires it, and fully green. Stop on a failed or pending required check.
2. Merge using the repository's required strategy and verify GitHub reports the PR merged.
3. Switch to `main`, fetch, and fast-forward only to the remote merge commit. Do not branch from a stale local base.
4. Fetch the exact tracker item before editing it. Mark it Done only after the merge is confirmed, and record the merged PR when the tracker supports comments or links.

If no merge was requested, begin at next-ticket selection without changing the PR or tracker state.

## Select and start the next ticket

1. Fetch the current roadmap or task database rather than relying on remembered ordering.
2. Choose the highest-priority eligible item. Verify every declared dependency is merged, not merely implemented or open as a PR.
3. Fetch the full ticket and its governing architecture sources. Extract its user story, acceptance boundary, constraints, dependencies, and material ambiguities.
4. Stop and ask Miguel when sources disagree in a way that changes architecture, schema, public API, capabilities, credentials, dependencies, or network exposure. Do not silently pick one.
5. Create `task/<nn>-<slug>` from the updated `main`, then mark the tracker item In progress.

## Deliver the ticket

- Work in outside-in vertical slices. Add one user-visible acceptance test, observe the expected RED result, implement the smallest GREEN change, then refactor.
- Drive the outermost surface currently available and use the project's shared acceptance harness. Keep tests isolated and parallel-safe.
- Optimize code for human maintainability and preserve the repository's architecture invariants. Update user-facing documentation when behavior changes.
- Run the complete quality gate and any task-specific smoke tests.
- Apply the repository's pre-commit review workflow and required fresh blind review. Address blocking findings within the allowed review rounds.
- Commit with the repository's verified convention, push the task branch, and open one PR that links the tracker ticket. Include user stories, exact tests, design decisions, rejected alternatives, and honest uncertainty.
- Wait for required CI checks and link the PR back to the tracker, leaving the ticket In progress until merge.

## Hand back to Miguel

Lead with what is now real. Show the shortest useful manual exercise, clearly distinguish implemented behavior from roadmap scaffolding, and provide the PR link and check status. Leave the PR open until Miguel explicitly asks to merge and kick off again.

Keep progress updates concise. Report decisions and blockers; do not narrate routine tool mechanics.
