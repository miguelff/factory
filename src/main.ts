import manifest from "../package.json";
import { startRuntime } from "./runtime";

const args = process.argv.slice(2);

if (args.includes("--version")) {
  console.log(`factory ${manifest.version}`);
} else if (args[0] === "up") {
  const runtime = await startRuntime({
    environment: process.env,
    port: readPort(args),
  });

  console.log(`factory listening ${runtime.address}`);
  await waitForShutdownSignal();
  await runtime.close();
}

function readPort(args: readonly string[]): number {
  const flagIndex = args.indexOf("--port");
  if (flagIndex === -1) {
    return 3000;
  }

  const value = args[flagIndex + 1];
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error("--port requires a number between 0 and 65535");
  }

  const port = Number(value);
  if (port > 65_535) {
    throw new Error("--port requires a number between 0 and 65535");
  }

  return port;
}

function waitForShutdownSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}
