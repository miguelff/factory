import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { resolveStatePath } from "../../src/state/state-path";

const projectRoot = join(import.meta.dir, "../..");

export interface FactoryRepo {
  readonly initialSha: string;
  readonly root: string;
  remove(): Promise<void>;
}

export interface RunningFactory {
  readonly address: string;
  readonly statePath: string;
  stop(): Promise<{ readonly exitCode: number; readonly stderr: string }>;
}

export interface StartFactoryOptions {
  readonly environment?: Readonly<Record<string, string>>;
  readonly factoryHome?: string;
  readonly launchDirectory?: string;
  readonly pathEntries?: readonly string[];
}

export async function newFactoryRepo(): Promise<FactoryRepo> {
  const root = await mkdtemp(join(tmpdir(), "factory-repo-"));

  try {
    const factoryDirectory = join(root, ".factory");
    await mkdir(factoryDirectory);
    await writeFile(join(factoryDirectory, "fixture.yaml"), "fixture: factory-in-a-box\n");

    await run(["git", "init", "--quiet"], root);
    await run(["git", "config", "user.name", "Factory Acceptance Tests"], root);
    await run(["git", "config", "user.email", "factory-tests@example.invalid"], root);
    await run(["git", "add", ".factory/fixture.yaml"], root);
    await run(["git", "commit", "--quiet", "-m", "Initialize Factory fixture"], root);
    const initialSha = (await run(["git", "rev-parse", "HEAD"], root)).trim();
    let removed = false;

    return {
      initialSha,
      root,
      async remove() {
        if (removed) {
          return;
        }
        removed = true;
        await rm(root, { force: true, recursive: true });
      },
    };
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  }
}

export async function startFactory(
  repo: FactoryRepo,
  options: StartFactoryOptions = {},
): Promise<RunningFactory> {
  const boxRoot = await mkdtemp(join(tmpdir(), "factory-box-"));
  const binaryPath = join(boxRoot, "factory");
  const factoryHome = options.factoryHome ?? join(boxRoot, "home");
  const launchDirectory = options.launchDirectory ?? repo.root;
  let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;

  try {
    const build = await Bun.build({
      compile: { outfile: binaryPath },
      entrypoints: [join(projectRoot, "src/main.ts")],
    });
    if (!build.success) {
      throw new Error(`Could not compile Factory:\n${build.logs.join("\n")}`);
    }

    const environment: Record<string, string | undefined> = {
      ...process.env,
      ...options.environment,
      FACTORY_HOME: factoryHome,
    };
    if (options.pathEntries !== undefined) {
      environment.PATH = [...options.pathEntries, environment.PATH ?? ""].join(delimiter);
    }

    const runningChild = Bun.spawn([binaryPath, "up", "--port", "0"], {
      cwd: launchDirectory,
      env: environment,
      stderr: "pipe",
      stdout: "pipe",
    });
    child = runningChild;
    const stderr = new Response(runningChild.stderr).text();
    const address = await readListeningAddress(runningChild.stdout);
    const statePath = await resolveStatePath(factoryHome, launchDirectory);
    let stopResult: Promise<{ readonly exitCode: number; readonly stderr: string }> | undefined;

    return {
      address,
      statePath,
      stop() {
        stopResult ??= stopFactory(runningChild, stderr, boxRoot);
        return stopResult;
      },
    };
  } catch (error) {
    if (child !== undefined) {
      child.kill("SIGKILL");
      await child.exited;
    }
    await rm(boxRoot, { force: true, recursive: true });
    throw error;
  }
}

async function run(command: readonly string[], cwd: string): Promise<string> {
  const child = Bun.spawn([...command], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed (${exitCode}): ${stderr.trim()}`);
  }
  return stdout;
}

async function readListeningAddress(stdout: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  try {
    while (true) {
      const result = await Promise.race([
        reader.read(),
        Bun.sleep(5_000).then(() => {
          throw new Error("Factory did not report its listening address within 5 seconds");
        }),
      ]);
      if (result.done) {
        throw new Error("Factory exited before reporting its listening address");
      }

      buffered += decoder.decode(result.value, { stream: true });
      const newline = buffered.indexOf("\n");
      if (newline === -1) {
        continue;
      }

      const line = buffered.slice(0, newline);
      const match = /^factory listening (http:\/\/[^/]+)$/.exec(line);
      if (match?.[1] === undefined) {
        throw new Error(`Unexpected Factory startup output: ${line}`);
      }
      return match[1];
    }
  } finally {
    reader.releaseLock();
  }
}

async function stopFactory(
  child: Bun.Subprocess<"ignore", "pipe", "pipe">,
  stderr: Promise<string>,
  boxRoot: string,
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  child.kill("SIGTERM");

  try {
    const exitCode = await Promise.race([
      child.exited,
      Bun.sleep(5_000).then(() => {
        child.kill("SIGKILL");
        return child.exited;
      }),
    ]);
    return { exitCode, stderr: await stderr };
  } finally {
    await rm(boxRoot, { force: true, recursive: true });
  }
}
