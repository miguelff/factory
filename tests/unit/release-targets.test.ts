import { describe, expect, test } from "bun:test";
import {
  RELEASE_TARGETS,
  releaseArtifactPath,
  selectReleaseTargets,
} from "../../scripts/release-targets";

describe("release targets", () => {
  test("covers supported macOS and Linux architectures", () => {
    expect(RELEASE_TARGETS).toEqual([
      { bunTarget: "bun-darwin-arm64", artifact: "factory-darwin-arm64" },
      { bunTarget: "bun-darwin-x64", artifact: "factory-darwin-x64" },
      { bunTarget: "bun-linux-arm64", artifact: "factory-linux-arm64" },
      { bunTarget: "bun-linux-x64-baseline", artifact: "factory-linux-x64" },
    ]);
  });

  test("puts release artifacts in one predictable directory", () => {
    expect(releaseArtifactPath("factory-linux-arm64")).toBe(
      "dist/release/factory-linux-arm64",
    );
  });

  test("selects one artifact for parallel CI builds", () => {
    expect(selectReleaseTargets("factory-darwin-x64")).toEqual([
      { bunTarget: "bun-darwin-x64", artifact: "factory-darwin-x64" },
    ]);
    expect(() => selectReleaseTargets("factory-windows-x64")).toThrow(
      "Unknown release artifact: factory-windows-x64",
    );
  });
});
