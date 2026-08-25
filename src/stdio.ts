#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createMisterCleanServer } from "./server.js";

serveStdio(createMisterCleanServer, {
  onerror(error) {
    console.error(`Mister Clean MCP error: ${error.message}`);
  },
});
