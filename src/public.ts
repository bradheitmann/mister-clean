import {
  bindRuntimeAttestation,
  isSourceDevelopmentEntrypoint,
  rootForModule,
} from "./attestation.js";
import { createMisterCleanServer as createBoundServer } from "./server.js";

const packageRoot = await rootForModule(import.meta.url);
const runtimeAttestation = await bindRuntimeAttestation(packageRoot, {
  moduleUrl: import.meta.url,
  expectedEntrypoint: "./dist/public.js",
  allowSourceDevelopment: process.env.MISTER_CLEAN_SOURCE_DEVELOPMENT === "1"
    && isSourceDevelopmentEntrypoint(packageRoot, import.meta.url),
  sourceDevelopmentReason: "explicit source-development package export execution",
});

/**
 * Create the public MCP server from a release-attested package entrypoint.
 * Module import fails closed before this factory becomes callable when the
 * installed package surface or this entrypoint has drifted.
 */
export function createMisterCleanServer() {
  return createBoundServer({ runtimeAttestation });
}
