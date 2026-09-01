#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import {
  bindRuntimeAttestation,
  isSourceDevelopmentEntrypoint,
  rootForModule,
} from "./attestation.js";
import { createMisterCleanServer } from "./server.js";

const packageRoot = await rootForModule(import.meta.url);
const runtimeAttestation = await bindRuntimeAttestation(packageRoot, {
  moduleUrl: import.meta.url,
  expectedEntrypoint: "./dist/stdio.js",
  allowSourceDevelopment: process.env.MISTER_CLEAN_SOURCE_DEVELOPMENT === "1"
    && isSourceDevelopmentEntrypoint(packageRoot, import.meta.url),
  sourceDevelopmentReason: "explicit source-development stdio execution",
});

serveStdio(() => createMisterCleanServer({ runtimeAttestation }), {
  onerror(error) {
    console.error(`Mister Clean MCP error: ${error.message}`);
  },
});
