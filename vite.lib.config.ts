import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import dts from "vite-plugin-dts";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import path from "path";
import pkg from "./package.json";

// Builds the publishable package into dist-lib/ (the demo app uses vite.config.ts)
const external = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];

export default defineConfig({
  // public/ holds the demo site's assets, not the package's
  publicDir: false,
  plugins: [
    react(),
    dts({
      tsconfigPath: "./tsconfig.app.json",
      include: ["src/components/import-wizard", "src/components/ui", "src/lib", "src/hooks"],
      exclude: ["**/__tests__/**", "**/*.test.*"],
      entryRoot: "src",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: "./tailwind.lib.config.ts" }), autoprefixer()],
    },
  },
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: {
        index: path.resolve(__dirname, "src/components/import-wizard/entry.ts"),
        core: path.resolve(__dirname, "src/lib/import-wizard/index.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => `${entryName}.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
      output: {
        assetFileNames: (asset) => (asset.name?.endsWith(".css") ? "styles.css" : "assets/[name][extname]"),
      },
    },
  },
});
