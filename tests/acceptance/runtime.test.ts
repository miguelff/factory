import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";

const projectRoot = join(import.meta.dir, "../..");
let buildDirectory = "";
let binaryPath = "";

beforeAll(async () => {
  buildDirectory = await mkdtemp(join(tmpdir(), "factory-build-"));
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

test("compiled Factory boots an isolated runtime and shuts down cleanly", async () => {
  const testRoot = await mkdtemp(join(tmpdir(), "factory-runtime-"));
  const factoryHome = join(testRoot, "home");
  const fakeBin = join(testRoot, "bin");
  const gitInvocation = join(testRoot, "git-invocation.txt");

  await mkdir(fakeBin, { recursive: true });
  const fakeGit = join(fakeBin, "git");
  await writeFile(
    fakeGit,
    '#!/bin/sh\nprintf "%s\\n" "$*" > "$FACTORY_TEST_GIT_INVOCATION"\n',
  );
  await chmod(fakeGit, 0o755);

  const child = Bun.spawn([binaryPath, "up", "--port", "0"], {
    env: {
      ...process.env,
      FACTORY_HOME: factoryHome,
      FACTORY_TEST_GIT_INVOCATION: gitInvocation,
      PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
    },
    stderr: "pipe",
    stdout: "pipe",
  });

  try {
    const address = await readListeningAddress(child.stdout);
    const response = await fetch(address);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>Factory</title>");

    const statePath = join(factoryHome, "state.db");
    expect((await stat(statePath)).isFile()).toBe(true);
    const database = new Database(statePath, { readonly: true });
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 0 });
    database.close();

    expect(await readFile(gitInvocation, "utf8")).toBe("--version\n");

    child.kill("SIGTERM");
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stderr).text()).toBe("");
  } finally {
    child.kill("SIGKILL");
    await child.exited;
    await rm(testRoot, { force: true, recursive: true });
  }
});

async function readListeningAddress(stdout: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      throw new Error("Factory exited before reporting its listening address");
    }

    buffered += decoder.decode(value, { stream: true });
    const newline = buffered.indexOf("\n");
    if (newline !== -1) {
      const line = buffered.slice(0, newline);
      const match = /^factory listening (http:\/\/[^/]+)$/.exec(line);
      if (match?.[1] === undefined) {
        throw new Error(`Unexpected startup output: ${line}`);
      }
      return match[1];
    }
  }
}
