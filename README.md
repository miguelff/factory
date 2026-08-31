# Factory

Factory is a ticket-driven software delivery system in which specialized AI-agent roles pull work through versioned pipelines. A standalone executable built with TypeScript and Bun provides the CLI, orchestrator, HTTP API, embedded web UI, importers, and SQLite state store.

The first vertical scaffold boots an isolated local runtime. Later roadmap tasks add the ticket and pipeline behavior described in the architecture contract.

## Start here

- [AGENTS.md](AGENTS.md) — implementation and review contract
- [Architecture summary](docs/architecture.md) — principles and system boundaries
- [Architecture source](https://app.notion.com/p/3cc433c39871816eade1c7e8b86af3c4)
- [Factory v1 roadmap](https://app.notion.com/p/1ff57c365edb41aabe83b3d9fc5bd277)

## Development

Requires [Bun](https://bun.sh/).

```sh
bun install
bun run check
bun run build
./dist/factory --version
FACTORY_HOME="$(mktemp -d)" ./dist/factory up --port 0
```

`bun run check` runs strict typechecking and the test suite. `factory up` binds to loopback; port `0` asks the operating system for an available port and prints the address.

Factory keeps each repository's live state in one SQLite file under `FACTORY_HOME`, which defaults to `~/.factory`. Repository directories use the readable form `<repo-name>-<path-hash>/state.db`, so repositories with the same name remain isolated. After stopping Factory cleanly, back up a repository by copying its `state.db` file. The schema is migrated automatically on startup; a binary refuses to open a database created by a newer schema version.

Acceptance tests use the shared factory-in-a-box harness in `tests/support/`. Each box compiles the real executable, runs it from a committed throwaway repository, isolates its SQLite state, binds an ephemeral loopback port, and owns its process and temporary-file cleanup. New ticket behaviors should extend this harness at their outermost available surface instead of assembling ad hoc runtimes.

`bun run build:release` cross-compiles standalone executables into `dist/release/` for macOS and Linux on arm64 and x64. CI validates every target independently. Pushing a `v*` tag runs the same checks and publishes all four executables to a GitHub release.
