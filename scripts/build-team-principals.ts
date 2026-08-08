/**
 * Build src/data/teamPrincipals.json from tenure list + driver-season outcomes.
 * Usage: node scripts/run-balance.mjs build-team-principals.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrincipalPool,
  resetPrincipalPoolCache,
  serializePrincipalPool,
} from "../src/lib/teamPrincipalPool";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "src/data/teamPrincipals.json");

resetPrincipalPoolCache();
const pool = buildPrincipalPool();
const payload = serializePrincipalPool(pool);
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${pool.length} principals → ${outPath}`);
