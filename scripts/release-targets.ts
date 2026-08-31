import { join } from "node:path";

export interface ReleaseTarget {
  readonly bunTarget: Bun.Build.CompileTarget;
  readonly artifact: string;
}

export const RELEASE_TARGETS: readonly ReleaseTarget[] = [
  { bunTarget: "bun-darwin-arm64", artifact: "factory-darwin-arm64" },
  { bunTarget: "bun-darwin-x64", artifact: "factory-darwin-x64" },
  { bunTarget: "bun-linux-arm64", artifact: "factory-linux-arm64" },
  { bunTarget: "bun-linux-x64-baseline", artifact: "factory-linux-x64" },
];

export function releaseArtifactPath(artifact: string): string {
  return join("dist", "release", artifact);
}

export function selectReleaseTargets(artifact: string | undefined): readonly ReleaseTarget[] {
  if (artifact === undefined) {
    return RELEASE_TARGETS;
  }

  const target = RELEASE_TARGETS.find((candidate) => candidate.artifact === artifact);
  if (target === undefined) {
    throw new Error(`Unknown release artifact: ${artifact}`);
  }

  return [target];
}
