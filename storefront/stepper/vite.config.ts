import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = __dirname;

export default defineConfig({
  root: rootDir,
  plugins: [tailwindcss(), tsconfigPaths()],
  define: {
    "import.meta.env.DEV": true,
    "import.meta.env.MODE": JSON.stringify("development"),
  },
  build: {
    outDir: path.resolve(
      rootDir,
      "../../extensions/personalize-design-app/assets",
    ),
    emptyOutDir: false,
    assetsDir: ".",
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        "personalize-stepper": path.resolve(
          rootDir,
          "src/personalize-stepper.tsx",
        ),
      },
      output: {
        format: "iife",
        entryFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "personalize-stepper.css";
          }
          return "[name][extname]";
        },
      },
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
          return;
        }
        warn(warning);
      },
    },
  },
});
