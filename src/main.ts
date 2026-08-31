import manifest from "../package.json";

if (process.argv.includes("--version")) {
  console.log(`factory ${manifest.version}`);
}
