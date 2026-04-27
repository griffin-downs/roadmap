import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// Host repo discovery — NOT hard-coded to fleet.
// Resolution order: ROADMAP_HOST_REPO env > --host-repo CLI flag (parsed elsewhere) > cwd.
// Subsequent nodes (viewer-port-core-readers, viewer-rewrite-realtime-bridge) consume
// this value to read `<host>/.roadmap/` artifacts. Scaffold-stage exposes the lookup
// only — no readers are wired yet.
function resolveHostRepo(): string {
  const fromEnv = process.env.ROADMAP_HOST_REPO;
  if (fromEnv && fromEnv.length > 0) return resolve(fromEnv);
  return resolve(process.cwd());
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: {
    __ROADMAP_HOST_REPO__: JSON.stringify(resolveHostRepo()),
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
