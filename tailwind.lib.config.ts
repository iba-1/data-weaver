import type { Config } from "tailwindcss";
import base from "./tailwind.config";

// Tailwind config for the published package (see vite.lib.config.ts)
export default {
  ...base,
  // Scope every utility to WizardRoot so the Host App is never affected
  important: ".dw-root",
  // The global reset would restyle the Host App; library.css has a scoped one
  corePlugins: { preflight: false },
  content: [
    "./src/components/import-wizard/**/*.{ts,tsx}",
    "./src/components/ui/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
    "!./src/**/__tests__/**",
  ],
} satisfies Config;
