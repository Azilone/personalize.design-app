import { spawn } from "node:child_process";

const scrubEnvKeys = [
  // pnpm-only configs that npm doesn't recognize; they cause warnings when a
  // tool spawns `npm` under the hood (e.g. React Router via Shopify CLI).
  "npm_config_verify_deps_before_run",
  "npm_config__jsr_registry",
  "npm_config_store_dir",
];

for (const key of scrubEnvKeys) {
  delete process.env[key];
}

const shopifyArgs = ["app", "dev", ...process.argv.slice(2)];
const child = spawn("shopify", shopifyArgs, {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (typeof code === "number") {
    process.exit(code);
  }
  process.kill(process.pid, signal ?? "SIGTERM");
});
