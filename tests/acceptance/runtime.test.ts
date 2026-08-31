import { expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { newFactoryRepo, startFactory } from "../support/factory-in-a-box";

test("compiled Factory boots an isolated runtime and shuts down cleanly", async () => {
  const testRoot = await mkdtemp(join(tmpdir(), "factory-runtime-"));
  const fakeBin = join(testRoot, "bin");
  const gitInvocation = join(testRoot, "git-invocation.txt");

  try {
    await mkdir(fakeBin, { recursive: true });
    const fakeGit = join(fakeBin, "git");
    await writeFile(
      fakeGit,
      '#!/bin/sh\nprintf "%s\\n" "$*" > "$FACTORY_TEST_GIT_INVOCATION"\n',
    );
    await chmod(fakeGit, 0o755);
    const repo = await newFactoryRepo();

    try {
      const factory = await startFactory(repo, {
        environment: {
          FACTORY_TEST_GIT_INVOCATION: gitInvocation,
        },
        pathEntries: [fakeBin],
      });

      try {
        const response = await fetch(factory.address);

        expect(response.status).toBe(200);
        expect(await response.text()).toContain("<title>Factory</title>");

        expect((await stat(factory.statePath)).isFile()).toBe(true);
        const database = new Database(factory.statePath, { readonly: true });
        expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 0 });
        database.close();

        expect(await readFile(gitInvocation, "utf8")).toBe("--version\n");

        expect(await factory.stop()).toEqual({ exitCode: 0, stderr: "" });
      } finally {
        await factory.stop();
      }
    } finally {
      await repo.remove();
    }
  } finally {
    await rm(testRoot, { force: true, recursive: true });
  }
});
