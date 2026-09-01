import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const expectedRuntimeExports = ["startLocalControlPlaneRuntime"];
const expectedTypeExports = ["LocalControlPlaneRuntimeOptions", "RunningLocalControlPlaneRuntime"];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function declarationExports(path: string): { readonly types: string[]; readonly values: string[] } {
  const program = ts.createProgram({
    rootNames: [path],
    options: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const source = program.getSourceFile(path);
  if (source === undefined) throw new Error(`generated declaration is unavailable: ${path}`);
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) throw new Error(`generated declaration is not an external module: ${path}`);
  const types: string[] = [];
  const values: string[] = [];
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const resolved = (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
    if ((resolved.flags & ts.SymbolFlags.Type) !== 0) types.push(symbol.name);
    if ((resolved.flags & ts.SymbolFlags.Value) !== 0) values.push(symbol.name);
  }
  return { types: types.sort(), values: values.sort() };
}

describe("built control-plane package surface", () => {
  it("exports exactly the supported runtime value and safe declarations", async () => {
    const javascriptPath = join(root, "dist", "control-plane.js");
    const declarationPath = join(root, "dist", "control-plane.d.ts");
    expect(await exists(javascriptPath)).toBe(true);
    expect(await exists(declarationPath)).toBe(true);
    const surface = await import(pathToFileURL(javascriptPath).href) as Record<string, unknown>;
    expect(Object.keys(surface).sort()).toEqual(expectedRuntimeExports);
    expect(declarationExports(declarationPath)).toEqual({
      types: expectedTypeExports,
      values: expectedRuntimeExports,
    });
  });

  it("returns no stale service or adapter capability from built JavaScript", async () => {
    const javascriptPath = join(root, "dist", "control-plane.js");
    const surface = await import(pathToFileURL(javascriptPath).href) as {
      startLocalControlPlaneRuntime(options: {
        readonly repository_database_path: string;
        readonly bearer_token: string;
        readonly unix_socket_path: string;
      }): Promise<Record<string, unknown> & { close(): Promise<void> }>;
    };
    const directory = await mkdtemp("/tmp/mc-built-public-runtime-");
    const runtime = await surface.startLocalControlPlaneRuntime({
      repository_database_path: join(directory, "repository.sqlite"),
      bearer_token: "built-public-control-plane-test-token-0001",
      unix_socket_path: join(directory, "control.sock"),
    });
    try {
      expect(Object.keys(runtime).sort()).toEqual([
        "close",
        "dispatch_supported",
        "execution_supported",
        "http",
        "unix_socket",
      ]);
      expect(Object.isFrozen(runtime)).toBe(true);
      expect(runtime.dispatch_supported).toBe(false);
      expect(runtime.execution_supported).toBe(false);
      for (const forbidden of ["service", "execute", "store"]) {
        expect(Object.hasOwn(runtime, forbidden)).toBe(false);
      }
      expect(Object.keys(runtime.unix_socket as object)).toEqual(["path"]);
      expect(Object.hasOwn(runtime.unix_socket as object, "close")).toBe(false);
    } finally {
      await runtime.close();
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects unsafe option record shapes before built JavaScript creates a database or socket", async () => {
    const javascriptPath = join(root, "dist", "control-plane.js");
    const surface = await import(pathToFileURL(javascriptPath).href) as {
      startLocalControlPlaneRuntime(options: unknown): Promise<unknown>;
    };
    const cases = [
      {
        name: "top-level nonstandard prototype",
        make(databasePath: string, socketPath: string): unknown {
          return Object.assign(Object.create({ http: { port: 0 } }) as object, {
            repository_database_path: databasePath,
            bearer_token: "built-public-control-plane-test-token-0001",
            unix_socket_path: socketPath,
          });
        },
      },
      {
        name: "nested HTTP nonstandard prototype",
        make(databasePath: string, socketPath: string): unknown {
          return {
            repository_database_path: databasePath,
            bearer_token: "built-public-control-plane-test-token-0001",
            unix_socket_path: socketPath,
            http: Object.assign(Object.create({ host: "127.0.0.1" }) as object, { port: 0 }),
          };
        },
      },
      {
        name: "symbol own key",
        make(databasePath: string, socketPath: string): unknown {
          return {
            repository_database_path: databasePath,
            bearer_token: "built-public-control-plane-test-token-0001",
            unix_socket_path: socketPath,
            [Symbol("unsupported")]: true,
          };
        },
      },
      {
        name: "unknown nested HTTP own key",
        make(databasePath: string, socketPath: string): unknown {
          return {
            repository_database_path: databasePath,
            bearer_token: "built-public-control-plane-test-token-0001",
            unix_socket_path: socketPath,
            http: { port: 0, unexpected_nested_option: true },
          };
        },
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const directory = await mkdtemp(`/tmp/mc-built-public-rejection-${index}-`);
      const databasePath = join(directory, "must-not-exist.sqlite");
      const socketPath = join(directory, "must-not-exist.sock");
      try {
        await expect(surface.startLocalControlPlaneRuntime(testCase.make(databasePath, socketPath)))
          .rejects.toThrow();
        expect(await exists(databasePath), `${testCase.name} created a database`).toBe(false);
        expect(await exists(socketPath), `${testCase.name} created a socket`).toBe(false);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  it("keeps built composition isolated from Object.prototype transport and authority pollution", async () => {
    const javascriptPath = join(root, "dist", "control-plane.js");
    const surface = await import(pathToFileURL(javascriptPath).href) as {
      startLocalControlPlaneRuntime(options: unknown): Promise<{
        readonly unix_socket: { readonly path: string } | null;
        readonly http: { readonly url: string } | null;
        close(): Promise<void>;
      }>;
    };
    const directory = await mkdtemp("/tmp/mc-built-prototype-pollution-");
    const rejectedDatabasePath = join(directory, "must-not-exist.sqlite");
    const pollutedSocketPath = join(directory, "must-not-exist.sock");
    const keys = ["unix_socket_path", "live_route_probes", "route_admission", "evidence_verifier", "clock"] as const;
    type PollutedKey = typeof keys[number];
    const reads = Object.fromEntries(keys.map((key) => [key, 0])) as Record<PollutedKey, number>;
    const values: Record<PollutedKey, unknown> = {
      unix_socket_path: pollutedSocketPath,
      live_route_probes: undefined,
      route_admission: { configured: true, async admit() { return { admitted: true, reason: "polluted", evidence: [] }; } },
      evidence_verifier: {
        configured: true,
        async verifyDirective() { return []; },
        async verifyReceipt() { return []; },
      },
      clock: () => "2000-01-01T00:00:00.000Z",
    };
    const prior = new Map<PollutedKey, PropertyDescriptor | undefined>();
    let rejectedError: unknown;
    let rejectedRuntimeReturned = false;
    let inheritedDatabaseActivated = false;
    let inheritedSocketActivated = false;
    let observedReads: Record<PollutedKey, number> | null = null;
    let runtime: Awaited<ReturnType<typeof surface.startLocalControlPlaneRuntime>> | null = null;
    try {
      for (const key of keys) {
        prior.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          get: () => { reads[key] += 1; return values[key]; },
        });
      }
      try {
        const unexpected = await surface.startLocalControlPlaneRuntime({
          repository_database_path: rejectedDatabasePath,
          bearer_token: "built-public-control-plane-test-token-0001",
        });
        rejectedRuntimeReturned = true;
        inheritedDatabaseActivated = await exists(rejectedDatabasePath);
        inheritedSocketActivated = await exists(pollutedSocketPath);
        await unexpected.close();
      } catch (error) {
        rejectedError = error;
        inheritedDatabaseActivated = await exists(rejectedDatabasePath);
        inheritedSocketActivated = await exists(pollutedSocketPath);
      }
      runtime = await surface.startLocalControlPlaneRuntime({
        repository_database_path: join(directory, "accepted.sqlite"),
        bearer_token: "built-public-control-plane-test-token-0001",
        http: { port: 0 },
      });
      inheritedSocketActivated ||= await exists(pollutedSocketPath);
      observedReads = { ...reads };
    } finally {
      for (const key of [...keys].reverse()) {
        const descriptor = prior.get(key);
        if (descriptor === undefined) delete (Object.prototype as Record<string, unknown>)[key];
        else Object.defineProperty(Object.prototype, key, descriptor);
      }
    }
    try {
      expect(rejectedRuntimeReturned).toBe(false);
      expect(rejectedError).toBeInstanceOf(Error);
      expect((rejectedError as Error).message).toContain("requires at least one IPC adapter");
      expect(inheritedDatabaseActivated).toBe(false);
      expect(inheritedSocketActivated).toBe(false);
      expect(observedReads).toEqual(Object.fromEntries(keys.map((key) => [key, 0])));
      expect(runtime).not.toBeNull();
      expect(runtime!.unix_socket).toBeNull();
      const body = JSON.stringify({ version: "1", request_id: "health-built-pollution", kind: "query", name: "health", input: {} });
      const response = await fetch(runtime!.http!.url, {
        method: "POST",
        headers: { Authorization: "Bearer built-public-control-plane-test-token-0001", "Content-Type": "application/json" },
        body,
      });
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        result: { route_admission_configured: false, evidence_verification_configured: false },
      });
    } finally {
      await runtime?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("binds an exact closed export map to the built files and ordered checks", async () => {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      exports: Record<string, { types: string; import: string }>;
      files: string[];
      scripts: Record<string, string>;
      packageManager: string;
    };
    expect(Object.keys(packageJson.exports).sort()).toEqual([".", "./control-plane"]);
    expect(packageJson.exports["."]).toEqual({
      types: "./dist/public.d.ts",
      import: "./dist/public.js",
    });
    expect(packageJson.exports["./control-plane"]).toEqual({
      types: "./dist/control-plane.d.ts",
      import: "./dist/control-plane.js",
    });
    expect(Object.keys(packageJson.exports).every((name) => !name.includes("*"))).toBe(true);
    expect(packageJson.files).toContain("dist/control-plane.*");
    expect(packageJson.packageManager).toMatch(/^pnpm@/);
    expect(packageJson.scripts["pack:check"]).toContain("bun run package:import:check");
    expect(packageJson.scripts["pack:check"]).toContain("pnpm --config.ignore-scripts=true pack --dry-run");
    expect(packageJson.scripts["package:import:check"]).toBe("node scripts/verify_package_exports.mjs");
    expect(packageJson.scripts.build).toBe("bun run build:verified");
    expect(packageJson.scripts["build:verified"]).toContain("run_verified_build.ts --candidate=worktree");
    const build = packageJson.scripts["build:raw"] ?? "";
    expect(build.indexOf("package:source-surface:check")).toBeGreaterThan(build.indexOf("tsc --noEmit"));
    expect(build.indexOf("tsup")).toBeGreaterThan(build.indexOf("package:source-surface:check"));
    expect(build.indexOf("package:surface:check")).toBeGreaterThan(build.indexOf("tsup"));
  });

  it("ships the built Svelte application rather than an empty directory", async () => {
    const viteConfig = await readFile(join(root, "control-plane-app", "vite.config.ts"), "utf8");
    expect(viteConfig).toContain('cacheDir: "../dist/.vite-cache"');
    expect(viteConfig).not.toMatch(/cacheDir:\s*["'][^"']*node_modules/u);
    const appRoot = join(root, "dist", "control-plane");
    expect(await exists(join(appRoot, "index.html"))).toBe(true);
    const assets = await readdir(join(appRoot, "assets"));
    expect(assets.some((name) => name.endsWith(".js"))).toBe(true);
    expect(assets.some((name) => name.endsWith(".css"))).toBe(true);
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { files: string[] };
    expect(packageJson.files).toContain("dist/control-plane/**");
  });
});
