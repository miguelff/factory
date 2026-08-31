import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { releaseArtifactPath, selectReleaseTargets } from "./release-targets";

const projectRoot = join(import.meta.dir, "..");

for (const target of selectReleaseTargets(process.env.FACTORY_RELEASE_ARTIFACT)) {
  const relativeOutput = releaseArtifactPath(target.artifact);
  const output = join(projectRoot, relativeOutput);
  await mkdir(dirname(output), { recursive: true });

  const result = await Bun.build({
    compile: {
      outfile: output,
      target: target.bunTarget,
    },
    entrypoints: [join(projectRoot, "src/main.ts")],
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error(`Failed to build ${target.bunTarget}`);
  }

  console.log(`built ${relativeOutput}`);
}
