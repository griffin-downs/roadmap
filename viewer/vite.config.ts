import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

// Host repo discovery — NOT hard-coded to fleet.
// Resolution order: ROADMAP_HOST_REPO env > --host-repo CLI flag (parsed elsewhere) > cwd.
// Subsequent nodes (viewer-port-core-readers, viewer-rewrite-realtime-bridge) consume
// this value to read `<host>/.roadmap/` artifacts.
function resolveHostRepo(): string {
  const fromEnv = process.env.ROADMAP_HOST_REPO;
  if (fromEnv && fromEnv.length > 0) return resolve(fromEnv);
  return resolve(process.cwd());
}

// Ensure ROADMAP_HOST_REPO is set in process.env before any server reader
// imports it (realtimeBridge fails-hard otherwise · §Fail-hard).
const HOST_REPO = resolveHostRepo();
process.env.ROADMAP_HOST_REPO = HOST_REPO;

// API middleware factory. Lazy-imports the server module on first request to
// keep middleware ahead of vite's SPA fallback in the connect stack (the
// dashboard pattern · async registration loses the race).
function apiPlugin(
  name: string,
  path: string,
  importer: () => Promise<(req: IncomingMessage) => Promise<unknown>>,
): Plugin {
  return {
    name,
    configureServer(server: ViteDevServer) {
      let handlerPromise: Promise<(req: IncomingMessage) => Promise<unknown>> | null = null;
      server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const url = request.url ?? "";
        const pathname = url.split("?")[0];
        if (pathname !== path) {
          next();
          return;
        }
        try {
          if (!handlerPromise) handlerPromise = importer();
          const handler = await handlerPromise;
          const data = await handler(request);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(data));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: String(error) }));
        }
      });
    },
  };
}

function dagPlugin(): Plugin {
  return apiPlugin("roadmap-dag-api", "/api/roadmap-dag", async () => {
    const mod = await import("./src/services/dagReader.server.ts");
    return async (req: IncomingMessage) => mod.readDagPayload({ url: req.url });
  });
}

function roadmapPlugin(): Plugin {
  return apiPlugin("roadmap-api", "/api/roadmap", async () => {
    const mod = await import("./src/services/roadmapReader.server.ts");
    return async () => mod.scanRoadmaps();
  });
}

function trailPlugin(): Plugin {
  return apiPlugin("roadmap-trail-api", "/api/roadmap-trail", async () => {
    const mod = await import("./src/services/trailReader.server.ts");
    return async () => mod.readTrail();
  });
}

// laneRollup is exposed at /api/lane-rollup — currently delegates to scanRoadmaps
// (multi-lane projection). Separate endpoint kept so client can evolve.
function laneRollupPlugin(): Plugin {
  return apiPlugin("lane-rollup-api", "/api/lane-rollup", async () => {
    const mod = await import("./src/services/roadmapReader.server.ts");
    return async () => mod.scanRoadmaps();
  });
}

// SSE events stream — backed by realtimeBridge file watchers. Clients open
// /api/events and receive named events (head-changed · trail-appended ·
// node-advanced · batch-rolled) with a JSON payload carrying lane + path.
function eventsPlugin(): Plugin {
  return {
    name: "realtime-events",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const url = request.url ?? "";
        if (url.split("?")[0] !== "/api/events") {
          next();
          return;
        }
        const bridge = await import("./src/services/realtimeBridge.ts");
        try {
          bridge.startBridge();
        } catch (err) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: String(err) }));
          return;
        }
        response.setHeader("Content-Type", "text/event-stream");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");
        response.write(": connected\n\n");

        const unsubscribe = bridge.subscribe((event) => {
          response.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
        });

        const heartbeat = setInterval(() => response.write(": ping\n\n"), 20_000);

        request.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
      });
    },
  };
}

// Catch-all for unmatched /api/* — return 404 instead of letting vite serve
// index.html (otherwise clients can't distinguish missing endpoint from data).
// §Fail-hard · don't silently swallow.
function apiNotFoundPlugin(): Plugin {
  return {
    name: "api-not-found",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const url = request.url ?? "";
        if (!url.startsWith("/api/")) {
          next();
          return;
        }
        response.statusCode = 404;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ error: "no such api endpoint", path: url.split("?")[0] }));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    dagPlugin(),
    roadmapPlugin(),
    trailPlugin(),
    laneRollupPlugin(),
    eventsPlugin(),
    apiNotFoundPlugin(),
  ],
  define: {
    __ROADMAP_HOST_REPO__: JSON.stringify(HOST_REPO),
  },
  server: {
    host: true,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
