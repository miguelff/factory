import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "../..");
let buildDirectory = "";
let binaryPath = "";

beforeAll(async () => {
  buildDirectory = await mkdtemp(join(tmpdir(), "factory-version-build-"));
  binaryPath = join(buildDirectory, "factory");

  const build = await Bun.build({
    compile: { outfile: binaryPath },
    entrypoints: [join(projectRoot, "src/main.ts")],
  });

  expect(build.success).toBe(true);
});

afterAll(async () => {
  if (buildDirectory !== "") {
    await rm(buildDirectory, { force: true, recursive: true });
  }
});

test("operator can print the Factory version", async () => {
  const child = Bun.spawn([binaryPath, "--version"], {
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
