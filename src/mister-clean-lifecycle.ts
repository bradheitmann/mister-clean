/**
 * The canonical CLI can invoke this at the beginning of a Mister Clean run.
 * It receives a complete externally observed envelope; it never discovers a
 * worker, reads provider state, or manufactures identity/telemetry.
 */
export interface MisterCleanRunLifecycle {
  recordRunStart(): Promise<{ readonly run_event_id: string }>;
}

export interface LocalEvaluationRunLifecycleOptions {
  readonly endpoint: string;
  readonly bearer_token: string;
  readonly request_id: string;
  /** Canonical JSON RPC input. The service validates and decodes it. */
  readonly input: Record<string, unknown>;
}

function assertLoopbackRpcEndpoint(value: string): URL {
  const url = new URL(value);
  if ((url.protocol !== "http:" && url.protocol !== "https:")
    || (url.hostname !== "127.0.0.1" && url.hostname !== "::1" && url.hostname !== "localhost")) {
    throw new Error("Mister Clean evaluation lifecycle endpoint must be loopback HTTP(S)");
  }
  return url;
}

/** A narrow local RPC client. There is no provider execution or telemetry
 * collection here; callers supply retained evidence and observed identity. */
export class LocalEvaluationRunLifecycle implements MisterCleanRunLifecycle {
  readonly #endpoint: URL;
  readonly #bearerToken: string;
  readonly #requestId: string;
  readonly #input: Record<string, unknown>;

  constructor(options: LocalEvaluationRunLifecycleOptions) {
    this.#endpoint = assertLoopbackRpcEndpoint(options.endpoint);
    if (options.bearer_token.trim().length === 0 || options.request_id.trim().length === 0) {
      throw new Error("Mister Clean evaluation lifecycle requires bearer token and request id");
    }
    this.#bearerToken = options.bearer_token;
    this.#requestId = options.request_id;
    this.#input = options.input;
  }

  async recordRunStart(): Promise<{ readonly run_event_id: string }> {
    const response = await fetch(this.#endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.#bearerToken}`, "content-type": "application/json" },
      body: JSON.stringify({ version: "1", request_id: this.#requestId, kind: "command", name: "evaluation.run.start", input: this.#input }),
    });
    const body = await response.json() as { readonly ok?: unknown; readonly result?: { readonly run_event_id?: unknown }; readonly error?: { readonly message?: unknown } };
    if (!response.ok || body.ok !== true) {
      throw new Error(`Mister Clean evaluation lifecycle start was not admitted: ${typeof body.error?.message === "string" ? body.error.message : "local RPC failure"}`);
    }
    if (typeof body.result?.run_event_id !== "string" || body.result.run_event_id.trim().length === 0) {
      throw new Error("Mister Clean evaluation lifecycle start response omitted run_event_id");
    }
    return { run_event_id: body.result.run_event_id };
  }
}
