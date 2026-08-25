import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "dist", "cli.js");
const target = join(root, "bin", "mister-clean.js");
const content = await readFile(source, "utf8");

await mkdir(dirname(target), { recursive: true });
await writeFile(target, content, "utf8");
console.log(`Synced standalone CLI to ${target}`);
