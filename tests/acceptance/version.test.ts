import { expect, test } from "bun:test";
import { join } from "node:path";

test("operator can print the Factory version", async () => {
  const entrypoint = join(import.meta.dir, "../../src/main.ts");
  const child = Bun.spawn([process.execPath, entrypoint, "--version"], {
    stderr: "pipe",
    stdout: "pipe",
  });

  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);

  expect(exitCode).toBe(0);
  expect(stderr).toBe("");
  expect(stdout).toBe("factory 0.0.0-dev\n");
});
