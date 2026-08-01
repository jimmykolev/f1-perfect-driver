import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = process.argv[2] ?? "balance-sim.ts";

const server = await createServer({
  root,
  plugins: [react(), tailwindcss()],
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, entries: [] },
});

try {
  await server.ssrLoadModule(`/scripts/${script}`);
} finally {
  await server.close();
}
