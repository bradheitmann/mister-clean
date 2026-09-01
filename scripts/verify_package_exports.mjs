import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function exact(actual, expected, label) {
  const observed = [...actual].sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(observed) !== JSON.stringify(wanted)) {
    throw new Error(`${label}: expected ${JSON.stringify(wanted)}, observed ${JSON.stringify(observed)}`);
  }
}

function declarationExports(path) {
  const source = readFileSync(path, "utf8");
  if (/export\s+(?:default|\*)/u.test(source)) {
    throw new Error(`${path}: wildcard or default declaration exports are forbidden`);
  }
  const blocks = [...source.matchAll(/^export\s*\{([^}]*)\};?$/gmu)];
  if (blocks.length !== 1) throw new Error(`${path}: expected one exact declaration export block`);
  return blocks[0][1].split(",").map((entry) => {
    const normalized = entry.trim().replace(/^type\s+/u, "");
    return normalized.split(/\s+as\s+/u).at(-1);
  }).filter(Boolean);
}

function javascriptExports(path) {
  const source = readFileSync(path, "utf8");
  if (/export\s+(?:default|\*)/u.test(source)) {
    throw new Error(`${path}: wildcard or default runtime exports are forbidden`);
  }
  const blocks = [...source.matchAll(/^export\s*\{([^}]*)\};?$/gmu)];
  if (blocks.length !== 1) throw new Error(`${path}: expected one exact runtime export block`);
  return blocks[0][1].split(",").map((entry) => {
    const normalized = entry.trim();
    return normalized.split(/\s+as\s+/u).at(-1);
  }).filter(Boolean);
}

exact(javascriptExports(join(root, "dist", "public.js")), ["createMisterCleanServer"], "root runtime exports");
exact(declarationExports(join(root, "dist", "public.d.ts")), ["createMisterCleanServer"], "root declaration exports");

const controlPlane = await import(join(root, "dist", "control-plane.js"));
exact(Object.keys(controlPlane), ["startLocalControlPlaneRuntime"], "control-plane runtime exports");
exact(
  declarationExports(join(root, "dist", "control-plane.d.ts")),
  ["LocalControlPlaneRuntimeOptions", "RunningLocalControlPlaneRuntime", "startLocalControlPlaneRuntime"],
  "control-plane declaration exports",
);

process.stdout.write("package export surfaces: PASS\n");
