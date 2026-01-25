import { spawn, spawnSync } from "node:child_process";

const buildResult = spawnSync("pnpm", ["run", "build:extension"], {
  stdio: "inherit",
  shell: true,
});

if (buildResult.status && buildResult.status !== 0) {
  process.exit(buildResult.status);
}

const extension = spawn("pnpm", ["run", "dev:extension"], {
  stdio: "inherit",
  shell: true,
});

const app = spawn(
  "node",
  [
    "./scripts/shopify-dev.mjs",
    "--tunnel-url",
    "https://dev.personalize.design:3000",
  ],
  {
    stdio: "inherit",
  },
);

const shutdown = (code) => {
  if (!extension.killed) {
    extension.kill("SIGINT");
  }
  if (!app.killed) {
    app.kill("SIGINT");
  }
  process.exit(code ?? 0);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

extension.on("exit", (code) => {
  if (code && code !== 0) {
    shutdown(code);
  }
});

app.on("exit", (code) => {
  shutdown(code ?? 0);
});
