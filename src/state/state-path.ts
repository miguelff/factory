import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";

export async function resolveStatePath(
  factoryHome: string,
  repositoryDirectory: string,
): Promise<string> {
  const repositoryRoot = await resolveRepositoryRoot(repositoryDirectory);
  const canonicalRoot = await realpath(repositoryRoot);
  const readableName = basename(canonicalRoot).replaceAll(/[^a-zA-Z0-9._-]/g, "-");
  const pathHash = createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 12);
  const repositoryKey = `${readableName || "repository"}-${pathHash}`;
  return join(factoryHome, repositoryKey, "state.db");
}

async function resolveRepositoryRoot(repositoryDirectory: string): Promise<string> {
  const child = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    cwd: repositoryDirectory,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);

  if (exitCode !== 0) {
    const detail = stderr.trim();
    throw new Error(
      detail === ""
        ? "git rev-parse --show-toplevel failed"
        : `git rev-parse --show-toplevel failed: ${detail}`,
    );
  }

  const root = stdout.trim();
  if (root === "" || !isAbsolute(root)) {
    throw new Error("git rev-parse --show-toplevel returned an invalid repository root");
  }
  return root;
}
