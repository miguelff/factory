import { expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { newFactoryRepo, startFactory } from "../support/factory-in-a-box";

test("factory-in-a-box boots from a committed disposable repository", async () => {
  const repo = await newFactoryRepo();

  try {
    const factory = await startFactory(repo);

    try {
      expect(repo.initialSha).toMatch(/^[0-9a-f]{40}$/);
      expect(await readFile(join(repo.root, ".factory", "fixture.yaml"), "utf8")).toBe(
        "fixture: factory-in-a-box\n",
      );

      const status = Bun.spawnSync(["git", "status", "--porcelain"], {
        cwd: repo.root,
        stderr: "pipe",
        stdout: "pipe",
      });
      expect(status.exitCode).toBe(0);
      expect(status.stdout.toString()).toBe("");

      const response = await fetch(factory.address);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<title>Factory</title>");
      expect((await stat(factory.statePath)).isFile()).toBe(true);
    } finally {
      const stopped = await factory.stop();
      expect(stopped).toEqual({ exitCode: 0, stderr: "" });
    }
  } finally {
    await repo.remove();
  }
});
