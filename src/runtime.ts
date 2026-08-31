import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import index from "./ui/index.html";

interface RuntimeOptions {
  readonly environment: NodeJS.ProcessEnv;
  readonly port: number;
}

interface FactoryRuntime {
  readonly address: string;
  close(): Promise<void>;
}

export async function startRuntime(options: RuntimeOptions): Promise<FactoryRuntime> {
  const factoryHome = options.environment.FACTORY_HOME ?? join(homedir(), ".factory");
  await mkdir(factoryHome, { recursive: true });

  const database = new Database(join(factoryHome, "state.db"), { create: true });

  try {
    await verifyGit();

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: options.port,
      routes: {
        "/": index,
      },
    });
    let closed = false;

    return {
      address: server.url.origin,
      async close() {
        if (closed) {
          return;
        }
        closed = true;
        await server.stop(true);
        database.close();
      },
    };
  } catch (error) {
    database.close();
    throw error;
  }
}

async function verifyGit(): Promise<void> {
  const child = Bun.spawn(["git", "--version"], {
    stderr: "pipe",
    stdout: "ignore",
  });
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);

  if (exitCode !== 0) {
    const detail = stderr.trim();
    throw new Error(detail === "" ? "git --version failed" : `git --version failed: ${detail}`);
  }
}
