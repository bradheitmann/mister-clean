import { demoSnapshot } from "./fixture.js";
import { parseSnapshot, validateSnapshot, type ControlPlaneSnapshot } from "./read-model.js";

export interface ControlPlaneSnapshotSource {
  load(signal?: AbortSignal): Promise<ControlPlaneSnapshot>;
}

export interface SnapshotSourceOptions {
  readonly url?: string;
  readonly fetcher?: typeof fetch;
  readonly headers?: HeadersInit;
  /** The runtime's bearer token; `/session` mints a browser session only under it. */
  readonly sessionToken?: string;
}

export class UnavailableSnapshotSource implements ControlPlaneSnapshotSource {
  async load(): Promise<ControlPlaneSnapshot> {
    throw new Error("Control-plane evidence is unavailable: no accepted snapshot endpoint is configured");
  }
}

/** Same-origin by default; deployments may point this at an authenticated local RPC adapter. */
export class SameOriginSnapshotSource implements ControlPlaneSnapshotSource {
  readonly #url: string;
  readonly #sessionUrl: string;
  readonly #fetcher: typeof fetch;
  readonly #headers: HeadersInit;
  readonly #sessionToken: string | undefined;

  constructor(options: SnapshotSourceOptions = {}) {
    this.#url = options.url ?? import.meta.env.VITE_CONTROL_PLANE_SNAPSHOT_ENDPOINT ?? "./control-plane/snapshot.json";
    this.#sessionUrl = "./session";
    this.#fetcher = options.fetcher ?? fetch;
    this.#headers = options.headers ?? { accept: "application/json" };
    this.#sessionToken = options.sessionToken;
  }

  async load(signal?: AbortSignal): Promise<ControlPlaneSnapshot> {
    const init: RequestInit = { headers: this.#headers };
    if (signal) init.signal = signal;
    if (!this.#url) throw new Error("Control-plane evidence is unavailable: no accepted snapshot endpoint is configured");
    const sessionInit: RequestInit = { method: "GET", credentials: "same-origin" };
    if (this.#sessionToken !== undefined) sessionInit.headers = { authorization: `Bearer ${this.#sessionToken}` };
    if (signal !== undefined) sessionInit.signal = signal;
    const session = await this.#fetcher.call(globalThis, this.#sessionUrl, sessionInit);
    if (!session.ok) throw new Error(`Control-plane evidence unavailable: browser session (${session.status})`);
    const response = await this.#fetcher.call(globalThis, this.#url, { ...init, credentials: "same-origin" });
    if (!response.ok) throw new Error(`Control-plane evidence unavailable (${response.status})`);
    const value = await response.json() as { source?: unknown };
    if (value.source !== "live") throw new Error("Snapshot is missing a live evidence binding");
    const snapshot = parseSnapshot(value);
    if (snapshot.source !== "live") throw new Error("Snapshot is missing a live evidence binding");
    return snapshot;
  }
}

/**
 * The operator opens the app as `<app_url>#session_token=<bearer>`. A fragment
 * never reaches the server or the Referer header.
 */
export function sessionTokenFromFragment(hash: string): string | undefined {
  return new URLSearchParams(hash.replace(/^#/u, "")).get("session_token") ?? undefined;
}

export function sourceForLocation(search: string, source: ControlPlaneSnapshotSource = new SameOriginSnapshotSource()): ControlPlaneSnapshotSource {
  const params = new URLSearchParams(search);
  if (params.get("demo") === "1") return { load: async () => validateSnapshot(demoSnapshot) };
  return source;
}

export function demoBanner(snapshot: ControlPlaneSnapshot): string | null {
  return snapshot.source === "demo" ? "DEMONSTRATION DATA — NOT A CLEANLINESS VERDICT" : null;
}
