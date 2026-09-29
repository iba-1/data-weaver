import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { copyFile } from "fs/promises";

/**
 * GitHub Pages has no SPA fallback: a deep link like /data-weaver/features
 * gets the site's 404.html. Making it a copy of index.html lets the router
 * render the page instead.
 */
function pagesSpaFallback(): Plugin {
  let outDir = "dist";
  return {
    name: "pages-spa-fallback",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await copyFile(path.join(outDir, "index.html"), path.join(outDir, "404.html"));
    },
  };
}
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/data-weaver/" : "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), pagesSpaFallback()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
