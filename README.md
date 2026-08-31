# Factory

Factory is a ticket-driven software delivery system in which specialized AI-agent roles pull work through versioned pipelines. A standalone executable built with TypeScript and Bun will provide the CLI, orchestrator, HTTP API, embedded web UI, importers, and SQLite state store.

The repository is at bootstrap. Architecture and the contributor contract are established; the first roadmap task is not complete yet.

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
```

`bun run check` runs strict typechecking and the test suite. Build artifacts are written to `dist/`.
